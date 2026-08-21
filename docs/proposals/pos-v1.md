# PedidoLocal — proposta V1 do PDV / Novo Pedido

## Estado desta entrega

A Fase 1 de auditoria, decisões de domínio, Impeccable Shape, protótipo, screenshots, Critique e Distill foi aprovada. A Fase 2 implementa o PDV V1 no repositório real: schema e migration local, entitlement/RBAC, quote e criação transacional, cliente/endereço, tela autenticada, Central, KDS, outbox, Merchant Push e testes. A migration foi criada, mas não foi aplicada; nenhum commit ou deploy faz parte desta entrega.

## Direção aprovada pelo Shape

O recurso se chama **PDV** na navegação e **Novo pedido** dentro da página. Ele é uma nova origem autenticada para o mesmo `Order`, não um segundo domínio e não uma nova modalidade.

```text
Storefront ───────┐
QR da mesa ───────┼──> Quote/Pricing canônico ──> Order ──> Payment / Outbox
PDV ──────────────┘                                ├──────> Central / KDS
                                                   └──────> Pusher / Reports
```

A composição principal é uma bancada: catálogo e busca à esquerda; comanda e total sempre visíveis à direita. Entrega, mesa, configuração de produto e pagamento aparecem somente quando a decisão exige. Tablet e desktop são primários; mobile é fallback seguro.

## Auditoria do repositório real

- `Order` já é o agregado canônico para `DELIVERY`, `PICKUP` e `DINE_IN`, com snapshots financeiros, itens, opções, ofertas, ajustes, cupom, payment 1:1, histórico, versão, outbox, tokens e relações de salão.
- Não existe `OrderOrigin`. `OrderChangeSource` descreve a fonte de uma alteração, não a aquisição do pedido.
- `Order` não guarda o funcionário criador. Só cancelamentos, status e pagamentos guardam atores em relações/históricos.
- `Order.customerName` é obrigatório hoje; `customerPhone` já é opcional. Para não criar nomes falsos em Balcão/Mesa, o nome precisa se tornar nullable.
- O checkout atual cria manual em `PENDING` e Pix Mercado Pago em `AWAITING_PAYMENT`. O aceite oficial atual grava `acceptedAt`, histórico, auditoria, versão e `ORDER_ACCEPTED`.
- `calculateCheckoutQuote()` é a autoridade de produtos, opções, combos, promoções, cupons, zonas, pedido mínimo, frete grátis, total e fingerprint. A criação repete a quote dentro de transação `Serializable`.
- A quote hoje incorpora a disponibilidade pública e aceita apenas contextos público/QR. Ela precisa receber uma política de canal, não ser copiada.
- A engine atual de ofertas inclui combo fixo/flexível, promoção por produto/quantidade, BOGO, condição de carrinho, frete grátis, modalidade, limites e cupons. Uso é reservado/consumido no mesmo fluxo do `Order`.
- `Customer` é único por `(tenantId, phoneNormalized)` e `CustomerAddress` possui fingerprint e uso por loja/zona. O reconhecimento atual é público, opaco e orientado ao consumidor; não existe lookup autenticado para equipe.
- `DiningTableSession` já usa transação serializável, advisory lock por mesa e índice parcial de uma sessão `OPEN`. A primitive `getOrCreateDiningSessionForCheckout()` já é reutilizável dentro da transação.
- `PaymentMethodType` possui `PIX`, `CASH`, `CARD_ON_DELIVERY` e `CARD_IN_PERSON`. O provider diferencia Pix Mercado Pago de Pix manual.
- O workflow manual permite confirmação oficial de `PIX`, `CASH` e `CARD_IN_PERSON`; `Payment.amount === Order.total` é validado. `CARD_ON_DELIVERY` é confirmado na conclusão operacional, não no cadastro.
- Pix online exige kill switch, entitlement, modo `ONLINE`, conexão Mercado Pago, e-mail do pagador, criação do provider, `AWAITING_PAYMENT` e reconciliação. Esse fluxo está acoplado ao checkout público e não serve ao PDV V1 sem expansão relevante.
- KDS consulta somente `CONFIRMED`, `PREPARING` e `READY`; não possui entidade própria. Central consulta o mesmo `Order`.
- O SLA operacional só encontra `PENDING`; um `Order` confirmado antes do commit nunca será candidato.
- Merchant Web Push projeta `ORDER_CREATED` com payload `PENDING` e ainda não conhece origem. Pusher/outbox já atualizam Central, KDS e tracking.
- Relatórios agregam `Order` por modalidade; adicionar origem nullable não altera as métricas atuais.
- Entitlements usam `StoreEntitlement`, schema de update, defaults e `STORE_FEATURE_DEFINITIONS`. Todas as flags operacionais nascem `false`.
- RBAC já separa `VIEW_CUSTOMER_CONTACT`, `CONFIRM_MANUAL_PAYMENT`, `VIEW/OPERATE_DINING_ROOM` e permissões de catálogo/pagamento.
- A disponibilidade atual combina tenant, `Store.status`, `isActive`, readiness, horário e exceções. Hoje ela é uma política única orientada ao storefront.
- Tabelas sensíveis usam escopo composto tenant/loja, acesso server-side, RLS e revogação para `anon`/`authenticated`. A proposta não precisa criar tabela.

## Gate de aprovação — 33 decisões

### 1. Order atual

O PDV cria `Order`, `OrderItem`, `OrderItemOption`, `OrderOfferGroup`, `OrderPriceAdjustment` e `Payment` canônicos. Não haverá `PosOrder`, `ManualOrder`, `PosPayment`, `PosQueue` ou `PosDeliveryFee`.

### 2. OrderOrigin

Adicionar:

```prisma
enum OrderOrigin {
  STOREFRONT
  DINE_IN_QR
  POS
}
```

`Order.origin` será nullable. Escritores novos sempre persistem uma origem; legado permanece `null` porque a migration não deve inventar história. `OrderChangeSource.DASHBOARD` continua representando mudanças humanas no painel.

### 3. Migration prevista

Uma única migration coerente, não executada nesta fase:

- criar `OrderOrigin`;
- adicionar `StoreEntitlement.posEnabled Boolean @default(false)`;
- adicionar `Order.origin OrderOrigin?`;
- adicionar `Order.createdById String?` e relação opcional `OrderCreatedBy` com `User`;
- tornar `Order.customerName` nullable;
- criar índices `(storeId, origin, createdAt, id)` e `(createdById, createdAt)`;
- adicionar a relação inversa `User.ordersCreated`;
- nenhum backfill especulativo;
- nenhuma tabela nova e nenhuma política RLS nova.

### 4. Entitlement

Adicionar feature `pos` em `STORE_FEATURE_DEFINITIONS`:

- field: `posEnabled`;
- label: `PDV / Balcão`;
- descrição: `Permite que a equipe registre pedidos de entrega, retirada e salão diretamente pelo PedidoLocal.`;
- default: `false`;
- Super Admin habilita por estabelecimento;
- OFF esconde menu e bloqueia página/action; Orders já criados continuam operacionais.

### 5. RBAC

Adicionar `OPERATE_POS` para Owner, Manager e Attendant. A rota e `createPosOrder` exigem essa permissão.

Permissões compostas continuam independentes:

- lookup/visualização de cliente: `VIEW_CUSTOMER_CONTACT`;
- marcar pago agora: `CONFIRM_MANUAL_PAYMENT`;
- usar Mesa: `OPERATE_DINING_ROOM` e entitlements `posEnabled + dineInQrEnabled`;
- `OPERATE_POS` não concede catálogo, preço, configuração financeira, refund ou gestão de QR.

### 6. Arquitetura do PDV

```text
/dashboard/pos
  -> Server Component autoriza e carrega catálogo resumido
  -> Client workspace mantém intenção local
  -> TanStack Query busca detalhe/quote/cliente
  -> Server Action deriva tenantId/storeId/userId da sessão
  -> createPosOrder() [boundary autenticado]
  -> primitives compartilhadas de quote/persistência/workflow
  -> commit
  -> dispatch de outbox/Pusher
```

`createPosOrder()` autoriza, resolve contexto, recalcula, persiste, aceita, aplica pagamento, audita e devolve o `Order` final. O checkout público mantém sua autorização própria, mas compartilha primitives de negócio.

### 7. Pricing

Não haverá `calculatePosPrice()`. `calculateCheckoutQuote()` será adaptada para um contexto explícito, por exemplo `{ origin: 'POS', availabilityPolicy: 'INTERNAL_OPERATION' }`, mantendo o mesmo cálculo e fingerprint.

### 8. Offers

O payload do PDV converge para o mesmo cart intent de produto/combo/opções. Quote e commit repetem regras, locks e consumo de ofertas. Mesma intenção + mesmo contexto deve produzir os mesmos centavos no storefront e PDV, inclusive frete grátis e cupom.

### 9. Retirada

Persistência: `origin=POS`, `modality=PICKUP`, sem endereço, zona, taxa ou sessão. Na operação, o label pode ser **Balcão**. Nome e telefone são opcionais; nenhum valor fake será criado.

### 10. Entrega

Persistência: `origin=POS`, `modality=DELIVERY`. Nome e telefone válidos são obrigatórios na V1 de entrega. Endereço completo é resolvido server-side e entra nos snapshots já existentes.

### 11. Mesa

Persistência: `origin=POS`, `modality=DINE_IN`, `diningTableId` e `diningTableSessionId`. Somente mesas ativas e da mesma loja aparecem. Nome é opcional e telefone não é exigido.

### 12. Customer lookup

Criar lookup autenticado por telefone brasileiro completo normalizado:

- match exato, não busca parcial enumerável;
- tenant derivado da sessão;
- exige `VIEW_CUSTOMER_CONTACT`;
- retorna cliente e no máximo cinco endereços ordenados por uso;
- sem dados de outro tenant e sem reutilizar cookies/tokens do reconhecimento público.

Para cliente novo, salvar é opt-in. Se salvo pelo funcionário, `recognitionEnabled=false`; o ato não concede consentimento para reconhecimento público.

### 13. Endereço

O browser envia `customerAddressId` ou um novo endereço. O servidor resolve sempre por `(id, tenantId, customerId)`; endereço anterior é sugestão e exige seleção explícita. Novo endereço pode ser salvo somente quando nome/telefone válidos e opt-in estiver ativo.

### 14. Delivery quote

Reutilizar zona, faixa postal, cidade/UF, pedido mínimo, fee, previsão e frete grátis atuais. A equipe nunca digita taxa. Endereço não atendido oferece `Alterar endereço` e `Mudar para retirada`; mínimo informa o valor faltante.

### 15. Pagamentos

| Modalidade | Métodos V1                         | Momento                                                  |
| ---------- | ---------------------------------- | -------------------------------------------------------- |
| PICKUP     | CASH, CARD_IN_PERSON, Pix manual   | agora ou depois                                          |
| DELIVERY   | CASH, CARD_ON_DELIVERY, Pix manual | CASH/CARD_ON_DELIVERY depois; Pix manual agora ou depois |
| DINE_IN    | CASH, CARD_IN_PERSON, Pix manual   | agora ou depois                                          |

Somente métodos habilitados na configuração aparecem. `Payment.amount` sempre recebe `quote.total`. Pago agora usa a transição oficial, `PaymentStatusHistory`, AuditLog e permissão. Escolher cartão ou Pix nunca infere `PAID`.

### 16. Política de Pix

**Pix online Mercado Pago não entra na V1 do PDV.** O fluxo atual exige contexto do checkout público, e-mail, criação no provider e reconciliação. Não será adaptado superficialmente.

Pix manual pode entrar quando `acceptsPix` e chave válida estiverem configurados em modo manual. Ele cria `Payment(provider=null, method=PIX)`; pago agora exige confirmação autorizada, pago depois fica `PENDING`.

### 17. Fluxo de status

```text
Manual / sem provider:
  create PENDING (não observável antes do commit)
  -> accept primitive oficial
  -> CONFIRMED

Final:
  CONFIRMED + Payment PENDING
  ou
  CONFIRMED + Payment PAID
```

`AWAITING_PAYMENT` permanece reservado ao provider online e não será usado artificialmente no PDV V1.

### 18. Criação + aceite

Dentro da mesma transação serializável:

1. criar Order/itens/offers/payment/histórico inicial/audit/outbox;
2. executar primitive transaction-aware de aceite, gravando `acceptedAt`, versão, histórico, audit e `ORDER_ACCEPTED`;
3. se autorizado e pago agora, executar primitive transaction-aware de pagamento;
4. finalizar reservas, sessão de mesa e outbox;
5. commit único.

O estado `PENDING` intermediário nunca fica visível a outro processo.

### 19. Idempotência

Chave estável por tentativa, lock por `(storeId, idempotencyKey)` e fingerprint contendo: store, `origin=POS`, modalidade, mesa/sessão, customer, endereço/fingerprint, itens, opções, coupon, payment intent e quote esperada. Duplo clique e retry de timeout retornam o mesmo Order ou conflito de fingerprint.

### 20. Central

O Order aparece na Central normal, com badge discreto `PDV`, criador e origem no detalhe quando autorizados. Status, cancelamento, pagamento, histórico e notas continuam nas ações oficiais.

### 21. KDS

`CONFIRMED` entra no KDS atual. Labels:

- POS + PICKUP: `BALCÃO`;
- POS + DELIVERY: `ENTREGA`;
- POS + DINE_IN: mesa efetiva.

A cozinha não precisa da origem nem do funcionário criador.

### 22. Pusher / Outbox

Reutilizar `ORDER_CREATED`, `ORDER_ACCEPTED` e `PAYMENT_UPDATED`; não criar `POS_ORDER_CREATED`. Acrescentar `origin` opcional ao payload ou resolver a origem no projetor. Central, KDS, Salão e tracking invalidam e refazem a leitura canônica.

### 23. Merchant Push

`projectStoreWebPushDispatch()` deve ignorar `Order.origin=POS`, mesmo que exista `ORDER_CREATED/PENDING` intermediário no outbox. Isso remove a notificação “novo pedido aguardando aceite” sem remover realtime operacional.

### 24. SLA

O reconciler atual seleciona somente `PENDING`. Como o Order POS termina `CONFIRMED` antes do commit, não há alerta de aceite. Adicionar teste explícito para impedir regressão.

### 25. Reports

Consultas atuais por modalidade continuam intactas. A V1 apenas persiste `origin` e expõe o campo nos DTOs autorizados; não cria BI novo. Uma agregação por origem fica preparada para evolução posterior.

### 26. Disponibilidade da loja

| Estado atual                            | Política PDV V1                |
| --------------------------------------- | ------------------------------ |
| Tenant PENDING/SUSPENDED                | bloquear                       |
| Store inactive                          | bloquear                       |
| NOT_READY/configuração inválida         | bloquear                       |
| PAUSED explícito                        | bloquear                       |
| CLOSED manualmente para pedidos online  | permitir com aviso persistente |
| Fora do horário/exceção pública fechada | permitir com aviso persistente |
| OPEN                                    | permitir                       |

`CLOSED` e horário público protegem aquisição online, mas não desligam a operação interna autenticada. `PAUSED`, suspensão, inatividade e falta de readiness continuam sendo barreiras fortes. O audit registra somente o estado, sem PII.

### 27. Segurança

- tenant, store e actor derivados da sessão;
- Server Action, service e queries repetem entitlement/RBAC;
- IDs do browser nunca definem escopo;
- lookup exato, tenant-safe e permissionado;
- AuditLog sem telefone/endereço/tokens;
- logs estruturados sem PII;
- nenhuma fila offline ou cache de Customer/Payment/Order no PWA;
- relações compostas e constraints atuais preservadas.

### 28. Performance

- catálogo resumido em batch, sem query por card;
- detalhe e opções carregados sob demanda e cacheados por `productId/version`;
- busca normalizada local/debounce, sem request a cada tecla;
- 500 produtos com render incremental/virtualização ou `content-visibility` após medição;
- quote com debounce curto e cancelamento de requests anteriores;
- imagens pela infraestrutura atual;
- query count e responsiveness cobertos por teste de 500 produtos.

### 29. Desktop

1440×900: sidebar compacta, destino em três ações, busca/categorias/produtos no campo principal e comanda fixa de 370 px. O total e o CTA permanecem visíveis.

### 30. Tablet

1024×768: navegação por ícones, grade em duas colunas, alvos de 44 px ou mais e comanda fixa de 330 px. Nenhuma ação depende de hover.

### 31. Mobile

390×844: uma coluna, categorias roláveis, produtos em duas colunas e CTA inferior `Ver pedido`. É fallback funcional; desktop/tablet continuam prioritários.

### 32. Screenshots

Todos usam dados fictícios:

- `01-pos-desktop-1440x900.png`;
- `02-pos-tablet-1024x768.png`;
- `03-product-config-1180x820.png`;
- `04-delivery-1180x820.png`;
- `05-table-1180x820.png`;
- `06-payment-1180x820.png`;
- `07-success-1180x820.png`;
- `08-kds-1180x820.png`;
- `09-pos-mobile-390x844.png`.

### 33. Riscos

1. **Extração transacional:** criação, aceite e pagamento atuais abrem fronteiras distintas. Mitigar com primitives internas que recebem `Prisma.TransactionClient`, sem duplicar workflow.
2. **Disponibilidade:** quote pública bloqueia horário/CLOSED. Mitigar com política explícita e testes de todos os estados, sem parâmetro livre vindo do browser.
3. **Merchant Push:** payload atual não tem origem. Mitigar com origem persistida e projetor consultando o Order canônico.
4. **Pix ambíguo:** `PIX` serve manual e provider. Mitigar sempre pelo par `method + provider` e excluir provider da V1.
5. **Customer/PII:** lookup interno pode virar enumeração. Mitigar com telefone completo, RBAC, escopo e logs sem PII.
6. **Legado sem origem/criador:** manter nullable e exibir `Origem não registrada` em vez de inventar.
7. **Requote/conectividade:** preservar intenção local e nunca mostrar sucesso antes do commit.
8. **Concorrência de mesa:** reutilizar lock/índice atuais e testar QR + PDV simultâneos.
9. **Evento intermediário PENDING:** garantir que SLA e Web Push leiam o estado final/origem, não apenas o payload intermediário.

## Impeccable Critique e Distill

O protótipo obteve **30/40**. A direção é específica e operacional; as lacunas principais são recuperação explícita para requote/offline/permissão e mais aceleração para o atendente frequente. O Distill manteve apenas destino, itens, contexto, pagamento e confirmação; caixa, desconto gerencial, WhatsApp, métricas e Pix online foram removidos da V1.

## Verificação da Fase 1

- 10 testes Playwright do protótipo passaram;
- nove screenshots em dimensões reais;
- nenhum overflow horizontal;
- busca local `x ba` retorna somente X-Bacon;
- inspeção navegável em localhost concluída;
- detector Impeccable executado uma vez após o último ajuste: zero ocorrências em fallback regex, com subcontagem declarada por parsers ausentes;
- nenhum banco, migration, backend, commit, push ou deploy executado.
