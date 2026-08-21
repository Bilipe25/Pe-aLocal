# PDV V1 — auditoria e proposta de hardening V2

> Gate de arquitetura e produto. Este documento descreve uma proposta ainda não implementada. Nenhuma migration, alteração de banco remoto ou mudança do fluxo produtivo faz parte desta etapa.

## 1. Estado real da V1

A V1 já cria um `Order` canônico com `origin = POS`, `createdById`, cotação recalculada no servidor, fingerprint de preço, chave de idempotência por loja, reserva/consumo de ofertas, aceite automático, pagamento manual opcional, auditoria e eventos de outbox. Página, action e service exigem `OPERATE_POS` e o entitlement `posEnabled`; mesa e confirmação de pagamento possuem permissões adicionais. A consulta de cliente usa telefone normalizado exato e escopo de tenant. O service worker nunca cacheia navegações de dashboard, auth, checkout ou APIs.

Validação focalizada em 21/08/2026: 5 arquivos e 50 testes passaram (`pos-schema`, `pos-permissions`, `order-idempotency-service`, `order-repository` e `pwa-service-worker`). O detector mecânico do Impeccable não encontrou ocorrências nos alvos da V1.

### Bugs e riscos observados

| Prioridade | Achado                                                                                                                 | Evidência atual                                                                                          | Correção proposta                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P1         | Pedido em edição existe somente em estado React e se perde em refresh, fechamento ou troca de dispositivo.             | `PosWorkspace` inicializa `cart`, cliente, endereço e pagamento localmente; não há entidade de rascunho. | `PosDraft` server-side com TTL, CAS e conversão atômica.                                                         |
| P1         | O workspace materializa todo o catálogo, todos os adicionais ativos e todas as ofertas no primeiro carregamento.       | `getPosWorkspace()` executa `product.findMany()` sem paginação e inclui `optionGroups.options`.          | Bootstrap leve, busca server-side paginada e detalhes sob demanda; favoritos e top-used retornam DTOs limitados. |
| P1         | Modalidade inicial é sempre Retirada, inclusive quando Retirada está desabilitada.                                     | Estado começa em `PICKUP`; o botão pode nascer selecionado e disabled.                                   | Resolver no servidor a primeira modalidade permitida e bloquear a composição até existir uma modalidade válida.  |
| P1         | Não há concorrência explícita para um pedido em montagem. Duas abas podem divergir sem aviso.                          | A V1 só possui idempotência na criação final.                                                            | `version` e compare-and-swap em toda mutação de draft; conflito 409 recuperável.                                 |
| P2         | O componente operacional possui mais de 1.500 linhas e mistura catálogo, cliente, entrega, quote, pagamento e sucesso. | `pos-workspace.tsx`.                                                                                     | Separar shell, catálogo, comanda, drawers e controllers por fronteira de domínio.                                |
| P2         | Imagens são carregadas no DTO, mas os cards da V1 não as exibem; reconhecimento depende quase só de texto.             | `imageUrl` é resolvida no service, não usada no grid.                                                    | Miniatura opcional consistente, placeholder textual e `alt` útil apenas quando a imagem agregar identificação.   |
| P2         | A busca de cliente rápida só está disponível no bloco Delivery; Retirada exige preenchimento manual.                   | Botão “Buscar cliente” é renderizado apenas na seção Delivery.                                           | Busca rápida contextual disponível em qualquer modalidade, com endereço apenas quando Delivery exigir.           |
| P2         | Erros de validação retornam detalhes por campo, mas a V1 mostra principalmente a mensagem geral no rail.               | Actions produzem `details`; componente usa `result.error.message`.                                       | Mapear detalhes para item/campo e preservar o draft durante recuperação.                                         |
| P2         | A tela pós-venda oferece somente novo pedido e Central.                                                                | Estado `success` atual.                                                                                  | Novo, ver, repetir e copiar acompanhamento; impressão continua omitida.                                          |
| P2         | Não há operador/terminal persistentes na superfície.                                                                   | `createdById` existe, mas a UI só identifica a loja; não existe terminal.                                | Operador derivado da sessão e `StorePosTerminal` validado no servidor, com snapshot no pedido.                   |

O que não deve ser refeito: `Order`, numeração, snapshots, pricing canônico, reservas de ofertas, pagamentos, outbox, Central, KDS e relatórios continuam sendo as autoridades atuais.

## 2. Limites da V2

- V2 é uma evolução do mesmo `/dashboard/pos`, não um caixa fiscal, ERP ou uma segunda Central.
- Um draft não é `Order`: não recebe número, não aparece na Central/KDS/relatórios, não emite outbox, não cria pagamento e não reserva uso de oferta.
- Offline continua sem fila de mutações. Em perda de rede, a UI preserva o último draft confirmado pelo servidor e explica o que ainda não foi salvo.
- Impressão não entra no escopo enquanto `orderPrinting` estiver `COMING_SOON`, mesmo que o entitlement exista no schema.
- O terminal é localização lógica, nunca fator de autorização.

## 3. Arquitetura proposta

```text
PosWorkspaceShell
  ├─ PosBootstrapQuery (capabilities, terminal, counters, favorites, top-used)
  ├─ PosCatalogSearch (paginado, detalhes sob demanda)
  ├─ PosDraftController ── CAS/TTL ── PosDraftRepository
  ├─ PosCustomerLookup (telefone normalizado exato)
  ├─ PosQuoteController ───────────── CheckoutQuoteService existente
  ├─ PosRecentOrders (DTO mínimo) ─── Order query existente/SQL limitado
  └─ PosConvertDraft ── transação ─── createOrder existente + outbox existente
```

Actions finas validam schema e chamam services. Services resolvem sessão, entitlement, RBAC e escopo composto. Repositories recebem obrigatoriamente `tenantId + storeId`; nenhum identificador do cliente escolhe tenant ou loja. O DTO do cliente e o payload descriptografado do draft usam `private, no-store` e nunca entram no cache PWA.

### 3.1 `PosDraft`

Proposta de campos:

- `id`, `tenantId`, `storeId`, `status` (`OPEN | CONVERTED | DISCARDED | EXPIRED`), `version`.
- `createdById`, `lastEditedById`, `terminalId` opcional.
- `payloadCiphertext`, `payloadIv`, `payloadKeyVersion`; o JSON contém intent, cliente/endereço e referências do catálogo. PII nunca fica em coluna de listagem ou log.
- `modality`, `itemCount` e `label` operacional sem PII para listagem degradada.
- `expiresAt`, `lastTouchedAt`, `convertedOrderId`, timestamps.
- FKs compostas de tenant/loja e índices `(tenantId, storeId, status, lastTouchedAt, id)` e `(status, expiresAt, id)`.

TTL proposto: **12 horas** desde o último save. É suficiente para interrupções e troca de turno sem manter PII além de uma jornada. Listar, criar, salvar e retomar executam limpeza oportunística limitada a 25 expirados da loja; um job futuro pode complementar, mas não é requisito de correção.

Concorrência: save usa `UPDATE ... WHERE id = ? AND tenantId = ? AND storeId = ? AND status = 'OPEN' AND version = ?`, incrementando `version`. Zero linhas vira `409 POS_DRAFT_CONFLICT`, com opção “Carregar versão mais recente” ou “Salvar como novo atendimento”.

Conversão: uma transação serializável bloqueia o draft, valida `version/status/TTL/terminal`, descriptografa o intent, recalcula a cotação corrente e executa a criação canônica já existente. Só depois marca o draft `CONVERTED` e grava `convertedOrderId`. Qualquer falha reverte tudo. Retry usa a mesma idempotency key de conversão.

### 3.2 Favoritos e mais usados

`StorePosShortcut` possui `tenantId`, `storeId`, `position`, `version`, `isActive`, auditoria de criador/editor e exatamente um alvo (`productId` ou `offerId`) garantido por check constraint. Owner/manager gerenciam; attendant apenas usa. Item arquivado permanece no slot como desabilitado até remoção consciente, evitando que a posição mude silenciosamente.

“Mais usados” é SQL determinístico, não IA: últimos 30 dias, `Order.origin = POS`, pedidos não cancelados, soma de `OrderItem.quantity` por `productId`, `ORDER BY units DESC, last_used_at DESC, product_id`, `LIMIT 12`. A consulta parte do índice já existente de pedidos `(storeId, origin, createdAt, id)` e junta itens pelo índice de `orderId`; o plano deve ser verificado com `EXPLAIN (ANALYZE, BUFFERS)` em volume representativo antes do rollout.

### 3.3 Recentes e repetir

Recentes retorna no máximo 20 pedidos POS da loja, cursor-based, com DTO mínimo: id, número, horário, modalidade, cliente mascarado/conforme permissão, total, status e até três nomes de itens. Não replica filtros ou ações operacionais da Central.

Repetir cria um **novo intent de draft** a partir dos snapshots históricos, resolve cada `productId/offerId` no catálogo atual e nunca copia preço, pagamento, cupom, desconto manual ou uso de oferta. Produto indisponível fica marcado para remoção; opções, combos e grupos alterados exigem reconfiguração. A quote atual é obrigatória antes de converter.

### 3.4 Cliente recorrente

V2 mantém somente busca exata por telefone brasileiro normalizado. Busca por nome fica adiada até existir contrato de privacidade, limiar mínimo, índice apropriado e paginação; varredura ampla de nomes não é aceita no PDV. Endereços retornam no máximo cinco, precisam de confirmação explícita e são novamente validados contra zona/CEP no quote e na conversão.

### 3.5 Desconto manual

- Novo tipo canônico `OrderPriceAdjustmentType.MANUAL_DISCOUNT` e ledger `OrderManualDiscount` 1:1 com o ajuste.
- Uma aplicação por pedido. Entrada fixa em centavos ou percentual em basis points; ambos viram centavos no servidor.
- Base elegível = subtotal de mercadorias menos ajustes promocionais/cupom de mercadoria já aplicados. Entrega nunca entra na base. Valor é limitado à base elegível; total nunca fica negativo.
- Stack permitido com promoções/cupom apenas nesta ordem: descontos automáticos → cupom → desconto manual. Frete grátis continua separado. Segundo desconto manual substitui o primeiro enquanto for draft; `Order` recebe apenas o resultado final imutável.
- Ledger: ator, autorizador, método `AUTHENTICATED_SESSION`, motivo padronizado, observação curta opcional, modo/valor solicitado, base elegível, valor aplicado e snapshot de label.
- Sem PIN compartilhado. Na primeira versão, apenas a sessão atualmente autenticada como OWNER/MANAGER com `APPLY_POS_MANUAL_DISCOUNT` aplica. Portanto ator e autorizador são a mesma identidade. Uma sessão de attendant não pode escolher ou digitar um aprovador.

### 3.6 Terminal e operador

`StorePosTerminal`: id composto por tenant/loja, nome, `isActive`, `version`, criador/editor, timestamps e `lastSeenAt`. Owner/manager gerenciam. O navegador pode lembrar somente o UUID do terminal; a cada bootstrap/save/conversão o servidor confirma que ele continua ativo e pertence à loja.

`Order` recebe `posTerminalId` opcional e `posTerminalLabelSnapshot`; desativar terminal nunca apaga histórico. Operador é sempre `session.userId/name`, nunca um dropdown no cliente. A barra superior mostra `Operador · Terminal` sem conceder poder adicional.

## 4. RBAC proposto

| Permissão                          | Owner | Manager |                   Attendant                    |
| ---------------------------------- | :---: | :-----: | :--------------------------------------------: |
| `OPERATE_POS`                      |   ✓   |    ✓    |                       ✓                        |
| `VIEW_CUSTOMER_CONTACT`            |   ✓   |    ✓    | ✓ (estado atual, revisar por política da loja) |
| `MANAGE_POS_SHORTCUTS`             |   ✓   |    ✓    |                       —                        |
| `MANAGE_POS_TERMINALS`             |   ✓   |    ✓    |                       —                        |
| `APPLY_POS_MANUAL_DISCOUNT`        |   ✓   |    ✓    |                       —                        |
| `VIEW_ORDER_HISTORY` para recentes |   ✓   |    ✓    |                       ✓                        |

Services revalidam a permissão a cada action; esconder controle é somente UX. Toda mutação administrativa escreve `AuditLog` sem PII. A aplicação do desconto possui ledger próprio e audit log com IDs e valores seguros.

## 5. UX operacional proposta

- Desktop 1440×900: shell do dashboard + catálogo dominante + rail de comanda de 400 px.
- Tablet 1024×768: navegação recolhida, split 60/40 e drawers por cima do catálogo; principal alvo de hardening.
- Mobile 390×844: fallback de catálogo com resumo fixo “Ver pedido”; dados e finalização abrem uma folha de tela inteira.
- Favoritos são uma faixa curta, seguidos de “Mais usados”; busca permanece dominante.
- “Em espera” e “Recentes” abrem drawers e não ocupam o canvas principal.
- Modo foco remove navegação global, preserva operador, terminal, relógio e uma saída clara.
- Remover item, limpar comanda ou descartar draft exige confirmação proporcional; remoção simples oferece toast com “Desfazer” sem interromper a operação.
- Atalhos: `/` busca; `Alt+1/2/3` modalidade; `Alt+H` em espera; `?` ajuda. São ignorados em inputs, textareas, selects, conteúdo editável e quando Ctrl/Meta estiver pressionado. Toda ação também existe como botão.
- Pós-venda: Novo pedido, Ver pedido, Repetir e Copiar acompanhamento. Impressão não aparece.

## 6. Migration planejada, sem execução neste gate

1. Expandir enums (`MANUAL_DISCOUNT`) e permissões.
2. Criar `pos_drafts`, `store_pos_shortcuts`, `store_pos_terminals` e `order_manual_discounts`, com RLS habilitado e privilégios diretos revogados conforme o padrão privado do projeto.
3. Adicionar `orders.posTerminalId` e `orders.posTerminalLabelSnapshot`, relações e índices.
4. Adicionar checks de alvo único do shortcut, payload/estado do draft e campos obrigatórios do ledger.
5. Gerar Prisma Client e validar schema/migration em banco efêmero.
6. Implementar services/repositories/actions e testes de tenant isolation, RBAC, TTL, CAS, conversão atômica, idempotência e cálculo do desconto.
7. Liberar por entitlement/feature flag, executar preflight e observar latência/erros antes do rollout.

Rollback funcional: desligar o gate V2 e manter V1 criando pedidos. As tabelas/colunas novas permanecem como expansão compatível até uma migration posterior e deliberada; não há rollback destrutivo automático.

## 7. Critérios de performance e segurança

- Bootstrap do PDV com payload limitado; catálogo paginado e detalhes lazy.
- Nenhuma listagem carrega Orders completos em Node para agregar top-used.
- Recentes e drafts limitados, cursor-based e sempre escopados por tenant/loja.
- PII de draft cifrada em repouso na aplicação; respostas `private, no-store`; logs sem payload/telefone/endereço.
- Mutação com validação server-side, constraints de banco, transação e idempotência.
- Métricas propostas: p95 bootstrap, p95 quote, p95 save draft, conflitos CAS, drafts expirados, conversões/retries e falhas por permission/terminal.

## 8. Sequência de implementação após aprovação

1. Domínio, schemas e migration local.
2. Draft/TTL/CAS/conversão e cobertura transacional.
3. Terminal, operador e RBAC.
4. Favoritos, top-used SQL e recentes.
5. Repeat/requote e cliente recorrente.
6. Desconto manual e ledger.
7. Refatoração do workspace e responsive/focus/shortcuts/pós-venda.
8. Testes unitários, integração, E2E, acessibilidade, carga SQL e PWA.
9. Somente após novo gate: aplicar migration remota, smoke test, commits e rollout.
