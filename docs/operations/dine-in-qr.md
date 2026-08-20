# Pedido por QR Code no Salão

## Visão geral

O salão é um único recurso controlado por `StoreEntitlement.dineInQrEnabled`. A V1 mantém QR, checkout `DINE_IN`, pagamentos por pedido, Central e KDS. A V2 adiciona `DiningTableSession` como agrupador operacional; `Order` continua sendo a fonte de verdade de cada pedido e `Payment` continua pertencendo a um único `Order`.

## Sessão da mesa

Uma sessão nasce somente no commit de um checkout `DINE_IN`. O checkout resolve a mesa pelo token opaco, adquire advisory lock por tenant/loja/mesa e, na mesma transação `Serializable`, reutiliza a sessão `OPEN` ou cria uma nova. O índice parcial `dining_table_sessions_one_open_per_table` é a última barreira contra duas sessões abertas na mesma mesa.

`Order.diningTableSessionId` é opcional para preservar pedidos V1. Delivery e Retirada devem mantê-lo nulo. Cada novo pedido de uma mesa com atendimento aberto é ligado à sessão existente, sem fundir itens, status, pagamentos, histórico, outbox ou versões.

O lifecycle da sessão possui apenas:

- `OPEN`: atendimento operacional em curso;
- `CLOSED`: atendimento encerrado com data e, quando humano, usuário responsável.

`lastOrderAt` melhora ordenação e observabilidade, mas não é fonte financeira.

## Rollover seguro

No próximo checkout, uma sessão esquecida só é fechada automaticamente quando existe pelo menos um pedido e é possível provar simultaneamente que:

- todos os pedidos estão `DELIVERED` ou `CANCELLED`;
- pedidos entregues têm pagamento `PAID` ou `REFUNDED`;
- pedidos cancelados têm pagamento `CANCELLED` ou `REFUNDED`;
- não existe service request `OPEN`.

Se qualquer condição for ambígua, o novo pedido permanece na sessão aberta e a equipe precisa resolver a pendência. Fechamento forçado não existe na V2.

## Conta consolidada

A conta é calculada por `buildDiningSessionFinancialSummary()` a partir dos Orders e seus estados oficiais de pagamento:

- pedido cancelado permanece no histórico, mas não entra no total considerado;
- pagamento `PAID` entra em pago;
- `PENDING`, `CUSTOMER_REPORTED_PAID`, `FAILED` e pagamento cancelado de pedido ativo exigem ação e entram em pendente;
- reembolso integral permanece visível como reembolsado e não entra em valor pendente;
- `AWAITING_PAYMENT` não é pago, não entra no KDS e continua pendente enquanto o Order existir;
- Pix, dinheiro e cartão presencial continuam resolvidos por Order, usando os serviços oficiais.

Não existe total mutável nem Payment da sessão.

## Solicitações de atendimento

`DiningTableServiceRequest` possui somente `ASSISTANCE` e `BILL`, com status `OPEN` ou `RESOLVED`. A criação pública:

- exige o token opaco da sessão aberta;
- é idempotente por `(sessionId, idempotencyKey)`;
- converge para uma única solicitação aberta por sessão/tipo por índice parcial;
- usa advisory lock e cooldown de 45 segundos;
- persiste antes de publicar o evento realtime.

Pedir a conta não fecha a sessão, não muda Order e não muda Payment. Resolver uma solicitação é uma ação autenticada com `OPERATE_DINING_ROOM` e gera `AuditLog`.

## Fechar e transferir

Fechar valida server-side pedidos ativos, pagamentos que exigem ação e solicitações abertas. A transição usa `version`/CAS; duas tentativas simultâneas produzem uma única mudança e um único audit log.

Transferir exige mesa ativa, livre e no mesmo tenant/loja. Locks em ordem estável, CAS e o índice de sessão aberta protegem concorrência. A relação histórica e `diningTableLabelSnapshot` dos Orders não são reescritas. Enquanto a sessão estiver aberta, Central e KDS usam a mesa atual da sessão como `effectiveDiningTableLabel`.

## Cliente e tokens públicos

O token de QR da mesa inicia pedidos. O token da sessão mantém a capability mínima do atendimento e continua válido quando o QR é rotacionado ou a sessão é transferida. O DTO público informa apenas:

- nome da loja e rótulo atual da mesa;
- sessão aberta ou encerrada;
- se assistência/conta já foi solicitada;
- caminho server-side para fazer outro pedido;
- ações mínimas de chamar atendimento e pedir conta.

Ele nunca retorna telefone, endereço, e-mail, nomes de terceiros, observações, lista da conta, Payment, tokens internos ou histórico de outros pedidos. O tracking individual continua protegido por `Order.publicToken`.

## Salão, Central e KDS

`/dashboard/dining-room` é a superfície operacional separada de “Mesas e QR Code”. O snapshot carrega mesas e suas relações em consultas agregadas, sem uma consulta por card, e suporta 100–200 mesas. A ordem visual é atendimento solicitado, conta solicitada, demais sessões abertas e mesas livres.

Central continua sendo o local das ações completas de pedido e pagamento. KDS continua exibindo somente `CONFIRMED`, `PREPARING` e `READY`; sessão, conta e solicitações não entram no workflow da cozinha.

## RBAC e isolamento

- `VIEW_DINING_ROOM`: Owner, Manager e Attendant;
- `OPERATE_DINING_ROOM`: Owner, Manager e Attendant;
- `VIEW_DINING_TABLES` e `MANAGE_DINING_TABLES`: configuração V1, preservada para Owner/Manager.

Toda operação autenticada combina `tenantId` e `storeId`. Toda operação pública deriva esse escopo exclusivamente do token. As novas tabelas têm chaves estrangeiras compostas, RLS habilitada e acesso direto revogado para `anon` e `authenticated`.

## Realtime e fallback

O Salão reutiliza `private-store-{storeId}` no Pusher. `dining-room-updated` carrega somente identificadores internos da entidade, motivo, versão e timestamp; o cliente invalida TanStack Query. Eventos oficiais de Order/Payment também invalidam o Salão. Transferência invalida Salão, Central e KDS. Se realtime degradar, o polling passa para 25 segundos.

O Service Worker existente trata `/q/s/*` como navegação sensível e nunca armazena sessões, solicitações, contas ou pedidos.

## Observabilidade

Os eventos estruturados são `DINING_SESSION_OPENED`, `DINING_SESSION_CLOSED`, `DINING_SESSION_TRANSFERRED`, `DINING_ASSISTANCE_REQUESTED`, `DINING_BILL_REQUESTED` e `DINING_REQUEST_RESOLVED`. Logs não incluem token público, nome do cliente, telefone, endereço, notas ou detalhes de pagamento.

## Rollout

1. Fazer backup e confirmar que as migrations V1 do salão estão aplicadas.
2. Executar `prisma migrate deploy` no ambiente autorizado.
3. Publicar a aplicação compatível com pedidos V1 sem sessão.
4. Validar criação concorrente, rollover, requests, transferência, fechamento, Central e KDS em uma loja interna.
5. Manter `dineInQrEnabled=false` nas lojas que ainda não devem receber novos atendimentos.

## Rollback operacional

Desligar `dineInQrEnabled` bloqueia novos pedidos QR, novas sessões e novas operações públicas. Sessões já abertas continuam visíveis para a equipe, podem ter requests resolvidos, pagamentos/pedidos concluídos e ser fechadas. A migration é aditiva; não remover colunas ou tabelas durante o rollback da aplicação.
