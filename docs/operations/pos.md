# PDV / Novo pedido — operação e rollout

## Escopo

O PDV é uma origem autenticada do agregado canônico `Order`. Ele cria pedidos de `PICKUP`, `DELIVERY` e `DINE_IN` pela rota `/dashboard/pos`, reutilizando catálogo, opções, combos, promoções, cupons, zonas de entrega, quote, pagamento, histórico, auditoria e outbox já existentes.

Não existe fila, preço, pedido ou pagamento paralelo. A V1 não oferece operação offline e não usa o Pix online do Mercado Pago.

## Habilitação e acesso

- A flag `StoreEntitlement.posEnabled` nasce `false` e é habilitada por estabelecimento pelo Super Admin.
- A permissão `OPERATE_POS` é concedida a Owner, Manager e Attendant.
- Consultar cliente exige também `VIEW_CUSTOMER_CONTACT`.
- Marcar pagamento como pago exige `CONFIRM_MANUAL_PAYMENT`.
- Usar Mesa exige `OPERATE_DINING_ROOM`, `posEnabled` e `dineInQrEnabled`.
- Com a flag desligada, a navegação é ocultada e página, quote, lookup e criação rejeitam o acesso no servidor. Pedidos já criados continuam operacionais.

## Modalidades e pagamento

| Modalidade | Cliente                                | Pagamentos                                                            |
| ---------- | -------------------------------------- | --------------------------------------------------------------------- |
| Retirada   | nome e telefone opcionais              | dinheiro, cartão presencial ou Pix manual; agora ou depois            |
| Entrega    | nome, telefone e endereço obrigatórios | dinheiro/cartão na entrega somente depois; Pix manual agora ou depois |
| Mesa       | mesa ativa obrigatória; nome opcional  | dinheiro, cartão presencial ou Pix manual; agora ou depois            |

Somente métodos habilitados nas configurações da loja aparecem. Pix manual requer chave e tipo válidos. `Payment.amount` usa o total da quote. A opção “pago agora” executa a transição oficial e nunca é inferida somente pelo método escolhido.

## Consistência transacional

A criação usa uma transação `Serializable` e uma chave idempotente estável por intenção. Dentro do mesmo commit, o serviço:

1. recalcula a quote canônica e valida seu fingerprint;
2. cria `Order`, itens, ofertas, ajustes, `Payment`, histórico, auditoria e `ORDER_CREATED`;
3. executa o aceite oficial, produzindo `ORDER_ACCEPTED`;
4. opcionalmente confirma o pagamento oficial e produz `PAYMENT_UPDATED`;
5. associa/salva cliente e endereço somente quando permitido.

O estado intermediário `PENDING` não fica observável. Retrys da mesma intenção retornam o mesmo pedido; reutilizar a chave com outro fingerprint gera conflito.

## Cliente, endereço e privacidade

O lookup usa telefone brasileiro completo, match exato e tenant derivado da sessão. Ele retorna no máximo cinco endereços. Endereço salvo só é aceito junto do cliente correspondente; todos os IDs são revalidados por tenant e loja.

Salvar cliente/endereço é opt-in. Cadastros feitos pela equipe nascem com `recognitionEnabled=false`, portanto não concedem reconhecimento público. Logs e auditorias não incluem telefone, endereço, token ou outros dados pessoais.

## Disponibilidade

O PDV pode operar fora do horário público ou com fechamento manual do canal online, mostrando aviso persistente. Ele bloqueia tenant pendente/suspenso, loja inativa, configuração não pronta e pausa operacional explícita. Flags de Delivery, Retirada e Salão continuam sendo respeitadas.

## Central, KDS, realtime, push e SLA

- A Central exibe badge `PDV` e o funcionário criador no detalhe autorizado.
- O KDS recebe o pedido já `CONFIRMED`; `POS + PICKUP` aparece como `Balcão`.
- Outbox e realtime reutilizam `ORDER_CREATED`, `ORDER_ACCEPTED` e `PAYMENT_UPDATED`.
- Merchant Web Push ignora pedidos com `origin=POS`, evitando notificação de novo pedido para a própria equipe.
- O reconciler de SLA de aceite só observa `PENDING`; como o pedido termina confirmado antes do commit, ele não gera alerta falso.

## Migration e rollout

A migration `20260821150000_pos_v1`:

- cria `OrderOrigin` (`STOREFRONT`, `DINE_IN_QR`, `POS`);
- adiciona `StoreEntitlement.posEnabled` com default `false`;
- adiciona `Order.origin` e `Order.createdById` opcionais;
- torna `Order.customerName` opcional;
- adiciona FK e índices operacionais.

Não há backfill de origem: pedidos legados permanecem com `origin=null`.

Sequência recomendada:

1. revisar e aplicar a migration no ambiente controlado;
2. publicar a aplicação com a flag ainda desligada;
3. habilitar uma loja piloto e validar Retirada, Entrega e Mesa;
4. observar falhas estruturadas `POS_ORDER_CREATE_FAILED`, outbox, KDS e pagamentos;
5. expandir a habilitação por estabelecimento.

Rollback funcional: desligar `posEnabled` imediatamente. Isso impede novas criações sem afetar pedidos existentes. O rollback de banco não deve remover colunas enquanto houver uma versão da aplicação que as utilize; prefira restauração de versão e mantenha os campos aditivos.

## Verificação mínima

- entitlement OFF: menu oculto e boundary bloqueado;
- RBAC: operador permitido; lookup/pago agora/Mesa exigem permissões compostas;
- quote: mesmos centavos, promoções, cupom e frete do checkout canônico;
- Delivery: endereço tenant-safe, mínimo e zona validados;
- pagamentos: matriz de métodos e `Payment.amount === Order.total`;
- idempotência: duplo clique/retry não duplica pedido;
- Central/KDS: origem, criador e label Balcão corretos;
- Merchant Push e SLA: sem aviso redundante/falso;
- logs/auditoria: sem PII.

## V2 — operação em horário de pico

### Pedidos em espera

`PosDraft` guarda intenção, nunca preço. O payload (itens, opções, cliente, endereço e intenção de pagamento) usa AES-256-GCM com `POS_DRAFT_ENCRYPTION_KEY` e AAD formada por tenant, loja e draft. Metadados não sensíveis ficam em colunas indexadas. O TTL é de 12 horas; listagens ignoram expirados e fazem limpeza oportunística limitada a 25 registros, apagando o payload sensível.

Criar/atualizar usa versão CAS. Retomar sempre recalcula a quote. Finalizar bloqueia o draft na mesma transação `Serializable` da criação do `Order`, valida versão e expiração, cria exatamente um pedido e marca o draft como `CONVERTED`. Draft não consome `orderNumber`, cupom, `OfferUsage`, `Payment`, outbox, KDS, Central, SLA nem relatórios.

### Favoritos, mais usados e recentes

- `StorePosShortcut` fixa até 24 produtos/ofertas com ordenação simples; Owner e Manager gerenciam, qualquer operador do PDV utiliza.
- “Mais usados” agrega no PostgreSQL os últimos 30 dias de pedidos `POS` não cancelados, limitado a 12 produtos, sem N+1.
- Recentes carrega no máximo 20 pedidos da loja, com DTO mínimo e sem telefone/endereço.
- Repetir chama `rebuildOrderIntentFromHistory()`: revalida produto/opções e usa preço atual. Não copia cupom, pagamento, estado pago nem desconto manual.

### Desconto manual e stacking

Somente a sessão autenticada de Owner/Manager com `APPLY_POS_MANUAL_DISCOUNT` pode aplicar. Não existe PIN compartilhado nem `authorized=true` vindo do browser. Valores fixos usam centavos; percentuais usam basis points (10.000 = 100%) e são arredondados uma vez para centavos.

Ordem única: ofertas automáticas → cupom → desconto manual → frete. A base elegível é `subtotal - automaticDiscount - couponDiscount`; frete não recebe desconto e o desconto nunca excede a base. O valor entra em `Order.discount`, `Order.total`, `Payment.amount` e `OrderPriceAdjustment(MANUAL_DISCOUNT)`. `PosManualDiscountLedger` preserva ator, autorizador, motivo, base, entrada e valor final; `AuditLog` registra o evento sem PII.

### Terminais, operador e atalhos

`StorePosTerminal` identifica onde, não quem. O navegador lembra apenas o ID; o servidor revalida tenant/loja/ativo. `Order.posTerminalLabelSnapshot` mantém o nome histórico após renome/deativação. O operador continua vindo exclusivamente da sessão em `Order.createdById`.

Atalhos: `/` busca, `Alt+1/2/3` troca modalidade, `Alt+H` coloca em espera e `?` mostra ajuda. Eles não disparam durante edição de inputs. Modo foco recobre a navegação sem mudar domínio ou autorização.

Impressão permanece `SKIPPED`: `orderPrinting` está `COMING_SOON`; não há impressão fiscal ou browser print improvisado.

### Migration, rollout e rollback V2

`20260821190000_pos_v2_operations` é aditiva: cria três entidades operacionais e o ledger, acrescenta terminal ao `Order`, tipos de desconto e índices/FKs/RLS. Não usar `db push` nem `migrate reset`.

Antes do rollout, gerar uma chave com 32 bytes aleatórios em base64 e configurá-la como secret `POS_DRAFT_ENCRYPTION_KEY`. Depois de aplicar a migration em ambiente controlado, validar uma loja piloto com dois terminais, conflito de draft e desconto de gerente. `posEnabled=false` continua sendo o rollback funcional: impede novo uso; Orders permanecem intactos e drafts nunca se convertem.
