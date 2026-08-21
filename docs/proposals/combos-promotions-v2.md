# Proposta de hardening V1 + Combos e Promoções V2

Status: **Fase 1 — proposta, sem implementação de backend**  
Capability: `combosPromotionsEnabled`  
Autoridade de preço: `calculateCheckoutQuote()`  
Kill switch: `StoreEntitlement.combosPromotionsEnabled=false`

Esta proposta evolui a V1 existente. Não cria `checkoutQuoteV2`, engine paralelo, flag V2, campaign builder, pricing DSL, prioridade configurável, event tracking, worker, fila, cron, Redis, vector DB ou LLM.

## 1. Auditoria V1

A auditoria completa está em `.impeccable/audit/2026-08-21__combos-promotions-v1-production.md`.

O desenho atual acerta os fundamentos: preço server-authoritative, centavos inteiros, safe money na quote, fingerprint/requote, transação Serializable, advisory lock para promoção, idempotência, snapshots, componentes reais para KDS, integração com Central/DINE_IN/PICKUP/DELIVERY, cache não autoritativo e Payment criado com `quote.total`.

O gate de produção não está fechado: existe um bug crítico no cancelamento de Pix pendente e hardenings importantes de limites, aritmética auxiliar, fail-closed, FKs e invariantes.

## 2. Bugs encontrados

| Severidade  | Achado                                                                                                  | Efeito                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| CRÍTICO     | Cancelamento local de Pix pendente não encerra a cobrança/provider e não libera a reserva imediatamente | Pagamento posterior para Order cancelado; alerta crítico/manual |
| IMPORTANTE  | Limite de 250 unidades conta combos, não unidades expandidas                                            | Milhões de unidades reais podem atravessar o input              |
| IMPORTANTE  | Cadastro/DTO/preview usam multiplicação comum fora do money guard                                       | Economia exibida/comparada pode perder precisão                 |
| IMPORTANTE  | Duas promos elegíveis corrompidas viram `Map` e uma vence silenciosamente                               | Desconto não determinístico em dado inválido                    |
| IMPORTANTE  | FKs de item/grupo/adjustment usam apenas ID                                                             | Banco não impede vínculo cruzado entre Orders/escopos           |
| IMPORTANTE  | Equação e soma de adjustments não têm assert canônico final                                             | Drift pode chegar à persistência sem erro explícito             |
| IMPORTANTE  | Serviço admin e concorrência real não têm testes próprios                                               | Lock/RBAC/tenant/versão não têm regressão suficiente            |
| REFINAMENTO | Paginação combinada busca `page*25` de cada origem                                                      | Overfetch crescente e desempate global incompleto               |
| REFINAMENTO | Estados pending/error/requote/esgotado são incompletos                                                  | Conflitos previsíveis parecem falha genérica                    |

## 3. Correções propostas

Ordem obrigatória na Fase 2:

1. fechar o fluxo Pix: provider-aware cancellation, guard antes de criar cobrança, reconciliação e release de cupom em transição terminal confirmada;
2. criar `money.ts` canônico e `assertQuoteFinancialInvariants()` usado na quote e no write;
3. limitar componentes, unidades e opções **depois** de expandir combos;
4. fazer a quote falhar fechada quando encontrar conflito de oferta;
5. reforçar FKs compostas e executar preflight dos dados atuais;
6. adicionar testes admin/concorrência/PostgreSQL e matriz de estados UX;
7. só então expandir schema e regras V2.

Nenhuma dessas correções foi aplicada nesta fase.

## 4. Riscos de produção

| Risco                                          | Nível       | Mitigação antes do rollout                                                  |
| ---------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Pix pagável depois de cancelamento local       | CRÍTICO     | Fechar antes de V2; teste provider-late-payment e alerta acionável          |
| Backfill do parent `StoreOffer` divergir da V1 | IMPORTANTE  | Migration idempotente, contagens/hash, dual-write compatível durante janela |
| Último uso disputado                           | IMPORTANTE  | Lock ordenado das ofertas + ledger único + re-quote na transação            |
| Alteração de regra entre quote e checkout      | IMPORTANTE  | Versão no fingerprint e revalidação dentro da transaction                   |
| Promoções incompatíveis por write privilegiado | IMPORTANTE  | Locks no cadastro, constraints onde possível e quote fail-closed            |
| Métrica chamada “venda” contar estado errado   | IMPORTANTE  | Mesma definição de Reports: `DELIVERED` + `PAID`                            |
| Query de oportunidades explodir pares          | IMPORTANTE  | Janela/candidatos limitados, agregação SQL, cache e benchmark               |
| Rollback do app perder mudanças V1 recentes    | IMPORTANTE  | Compatibilidade de escrita V1 por uma release e tabelas antigas preservadas |
| Storefront cacheado mostrar oferta encerrada   | REFINAMENTO | Agenda avaliada no request/render; quote uncached continua autoridade       |

## 5. Arquitetura atual preservada

```text
Merchant action
  -> active store + RBAC + entitlement
  -> OfferService
  -> Prisma/Serializable + advisory lock + optimistic version
  -> AuditLog + cache tags

Storefront/cart intent
  -> checkout schema + rate limit
  -> calculateCheckoutQuote()
       -> produtos/opções canônicos
       -> combos/promo/agenda/timezone
       -> cupom + delivery
       -> fingerprint + issues
  -> OrderRepository (re-quote em Serializable)
       -> Order + Items + OfferGroups + Adjustments
       -> Payment + Coupon + AuditLog + Outbox
  -> Central / KDS / Reports / Mercado Pago
```

Pontos que não mudam:

- `calculateCheckoutQuote()` continua sendo a única autoridade;
- cart envia IDs, quantidades e escolhas, nunca desconto/delta/taxa;
- `OrderOfferGroup` continua representando o combo aplicado;
- `OrderPriceAdjustment` continua sendo o ledger financeiro do Order;
- Order antigo nunca consulta oferta viva;
- componentes escolhidos continuam `OrderItem` real;
- `combosPromotionsEnabled` controla V1 e V2;
- cache/PWA nunca autorizam preço offline.

## 6. Arquitetura V2

A justificativa para um parent canônico `StoreOffer` é concreta: sete mecânicas precisam compartilhar agenda, modalidade, status, versão, limite, listagem, conflito e métricas. Sem parent, a listagem vira seis consultas/UNIONs e o ledger perde FK íntegra. Os subtipos continuam explícitos; não há JSON DSL.

```text
StoreOffer (comum)
  ├─ StoreCombo (V1 fixo ou V2 flexível)
  │    ├─ StoreComboItem (fixo, existente)
  │    └─ StoreComboChoiceGroup -> StoreComboChoice
  ├─ StoreProductPromotion (preço especial V1)
  ├─ StoreQuantityPromotion (N por preço)
  ├─ StoreBuyPayPromotion (leve X, pague Y)
  ├─ StoreCartPromotion (mínimo -> desconto fixo)
  └─ StoreFreeDeliveryPromotion (mínimo -> taxa eliminada)

StoreOffer -> StoreOfferModality
StoreOffer -> StoreOfferUsage

calculateCheckoutQuote() -> OfferEvaluator -> adjustments/snapshots
```

O engine recebe um `PricingContext` canônico (store, tenant, clock, modality, produtos/opções, linhas e ofertas candidatas). Avaliadores são funções puras por subtipo. O orquestrador impede dupla aplicação e produz uma única estrutura `CheckoutQuote`.

Conflitos não usam prioridade escondida. O cadastro bloqueia agendas incompatíveis sob lock; a quote considera cardinalidade inválida um erro operacional, não escolhe “a melhor”.

## 7. Combo flexível

Contrato V2 inicial, deliberadamente simples:

- combo é `FIXED` ou `FLEXIBLE`;
- um grupo significa “escolha exatamente 1”; `minSelections=1/maxSelections=1` podem existir no banco para integridade, mas não aparecem na UI;
- cada choice referencia Product da mesma loja e guarda `priceDelta >= 0` em centavos;
- ProductOptionGroup/ProductOption continuam sendo usados depois da escolha;
- browser envia `choiceId` e option IDs; servidor resolve product e delta;
- choice indisponível some; se um grupo obrigatório ficar vazio, o combo fica indisponível;
- quantidade 2 replica/valida todas as escolhas e componentes com limite pós-expansão;
- `comboOfferBase = combo.basePrice * quantity + SUM(choice.priceDelta * quantity)`;
- adicionais de ProductOption entram integralmente no subtotal e não reduzem o desconto do combo;
- `regularBaseAmount` usa preços-base atuais dos produtos escolhidos;
- economia precisa ser positiva em toda combinação válida. Como grupos são escolha única e independentes, o cadastro valida `fixedRegular + SUM(min(product.basePrice - delta) por grupo) > combo.basePrice`, sem produto cartesiano.

Persistência:

- `OrderOfferGroup` mantém nome, versão, quantidade, preço regular/oferta/desconto e kind snapshot;
- cada escolhido vira `OrderItem` com `offerGroupId`, posição e snapshots opcionais de nome do grupo, choice ID e delta;
- KDS mostra apenas “Combo da Casa” e os produtos reais; não mostra “grupo #3”.

## 8. Promoção por quantidade

Merchant informa produto, quantidade `N`, preço do grupo e máximo opcional de ativações por Order.

Regra:

```text
applications = min(floor(totalStandaloneQuantity / N), maxApplications ?? infinito)
promotedUnits = applications * N
remainder = totalStandaloneQuantity - promotedUnits
offerBase = applications * groupPrice + remainder * product.basePrice
```

Exemplos para `2 por R$44,90`: 1 normal; 2 uma aplicação; 3 uma aplicação + 1 normal; 4 duas aplicações. Quantidades do mesmo produto são agregadas entre linhas standalone; a alocação do ajuste volta para linhas em ordem estável. Opções permanecem preço cheio.

## 9. Leve X, pague Y

Merchant informa o mesmo produto, `takeQuantity`, `payQuantity` e máximo opcional de ativações. Constraints: `take > pay >= 1`.

```text
applications = min(floor(totalStandaloneQuantity / take), maxApplications ?? infinito)
freeUnits = applications * (take - pay)
discount = freeUnits * product.basePrice
```

Somente o preço-base participa; adicionais permanecem integrais. Product price promotion, quantity e BOGO não podem ter agenda/modalidade sobreposta para o mesmo SKU. Não há prioridade e nenhuma unidade recebe duas promoções automáticas.

## 10. Desconto por subtotal mínimo

Uma oferta define `minimumAmount` e `fixedDiscount`. A base elegível é congelada antes do ajuste:

```text
itemNetBeforeCart = subtotal
  - comboDiscounts
  - productPriceDiscounts
  - quantityDiscounts
  - buyPayDiscounts
```

- delivery não entra;
- cupom ainda não entrou;
- no máximo uma promoção de carrinho pode ser aplicada;
- `cartDiscount = min(fixedDiscount, itemNetBeforeCart)`;
- eligibility não é recalculada depois do próprio desconto: não há loop aplica/remove;
- store/zone minimum atuais continuam avaliados sobre `subtotal` bruto para preservar semântica V1.

## 11. Frete grátis condicional

Somente `DELIVERY`. A base é:

```text
merchandiseBeforeCoupon = itemNetBeforeCart - cartDiscount
```

O cupom não faz o cliente perder frete já conquistado. `PICKUP` e `DINE_IN` nunca aplicam essa oferta, mesmo que o payload tente forçar.

Semântica escolhida:

- `Order.deliveryFee` preserva a taxa original;
- um adjustment `FREE_DELIVERY` registra exatamente essa taxa, source/version/label e scope `DELIVERY`;
- `Order.discount` inclui todos os adjustments, inclusive frete;
- Reports/Payment usam o total final, sem inferir “deliveryFee=0”.

## 12. Ofertas por modalidade

`StoreOfferModality` usa FK/enum `OrderModality`, não string/boolean enviado pelo browser.

- defaults V1 backfilled: `DELIVERY`, `PICKUP`, `DINE_IN`;
- merchant vê três checkboxes com linguagem “Delivery / Retirada / Salão”;
- `FREE_DELIVERY` força somente Delivery no servidor e na UI;
- a quote filtra por modalidade canônica já resolvida;
- quando permitido, todos os novos tipos funcionam no QR/DINE_IN sem engine separado.

## 13. Limites de uso e concorrência

“Um uso” = um Order distinto no qual a oferta foi efetivamente aplicada, independentemente de quantas ativações de quantidade ocorreram dentro dele. `maxApplicationsPerOrder` é outro limite.

`StoreOfferUsage` é o ledger auditável, único por `(offerId, orderId)`:

- `RESERVED`: Order persistido e ainda não é venda válida;
- `CONSUMED`: Order chegou a `DELIVERED + PAID`;
- `RELEASED`: cancelado/falhou antes de consumo;
- `EXPIRED`: reserva pendente expirou;
- refund depois de `CONSUMED` não devolve uso automaticamente;
- transições são idempotentes e registram timestamps/reason sem PII.

O limite conta `RESERVED + CONSUMED`. Na criação do Order:

1. coletar ofertas finitas e ordenar IDs;
2. bloquear `StoreOffer` nessa ordem (`FOR UPDATE`) para evitar deadlock;
3. recalcular a quote dentro da transaction;
4. validar contador/ledger sob lock;
5. criar usage único e atualizar contadores reservados/consumidos;
6. se o último uso acabou, o segundo checkout recebe requote/conflito e não cria Order.

O ledger é source-of-truth; contadores denormalizados servem performance e têm preflight de reconciliação. Não há limite por cliente na V2.

## 14. Performance das ofertas

Métricas simples, derivadas com SQL agregado de `OrderOfferGroup`/`OrderPriceAdjustment`, nunca carregando Orders em Node:

- **Pedidos concluídos**: `COUNT(DISTINCT orderId)` em `DELIVERED + PAID`;
- **Subtotal de mercadorias**: `SUM(Order.subtotal)` desses Orders;
- **Economia concedida**: soma dos adjustments da oferta;
- **Ticket médio**: `SUM(Order.total) / pedidos concluídos`;
- períodos Hoje/7/30 dias usando `Store.timeZone` e `operationalStartedAt`, alinhados a Reports.

Não contar AWAITING_PAYMENT, Pix falho/expirado, cancelado ou refunded como venda. Não afirmar causalidade. “83 pedidos usaram” é fato; “a oferta aumentou 30%” não é.

Índices previstos: StoreOffer por store/kind/status/schedule; adjustment por `(tenantId, storeId, sourceIdSnapshot, createdAt, orderId)`; group equivalente; Order por store/status/paymentStatus/operationalStartedAt.

## 15. Oportunidades determinísticas

Separadas de pricing: analisam e sugerem, nunca interferem na quote.

Algoritmo V2:

1. últimos 90 dias de Orders `DELIVERED + PAID` da loja;
2. considerar conjunto de produtos standalone por Order, ignorando quantidade e componentes que já vieram de combo;
3. somente produtos ativos/não arquivados;
4. anchor precisa aparecer em pelo menos 20 Orders elegíveis;
5. par precisa co-ocorrer em pelo menos 5 Orders e share >=25% do anchor;
6. excluir par já coberto por combo ativo equivalente;
7. ordenar por co-occurrence, share, nomes/IDs estáveis;
8. limitar candidatos aos 100 produtos mais frequentes e instrumentar custo da query;
9. calcular sob demanda e cachear moderadamente por store/tag; sem Worker/Queue/Cron.

Ao clicar “Criar combo”, somente produtos e evidência são pré-preenchidos. **Preço especial fica vazio**; merchant decide e publica. Nunca há publicação automática.

## 16. Stacking final

| Combinação                                                    | Regra                                                |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| Combo + promo nos componentes                                 | Não; combo é dono do preço-base dos componentes      |
| Combo + adicionais                                            | Sim; adicionais a preço cheio                        |
| Combo + cupom                                                 | Sim; cupom depois dos automáticos                    |
| Product fixed price + quantity no mesmo SKU/agenda/modalidade | Cadastro bloqueia                                    |
| Product fixed price + BOGO no mesmo SKU/agenda/modalidade     | Cadastro bloqueia                                    |
| Quantity + BOGO no mesmo SKU/agenda/modalidade                | Cadastro bloqueia                                    |
| Ofertas de item em SKUs diferentes                            | Sim                                                  |
| Duas cart promotions elegíveis                                | Não; cadastro bloqueia overlap e quote falha fechada |
| Cart promotion + cupom                                        | Sim                                                  |
| Cart promotion + frete grátis                                 | Sim                                                  |
| Frete grátis + cupom                                          | Sim; cupom não inclui fee                            |
| Duas ofertas de frete elegíveis                               | Não; cadastro bloqueia overlap                       |
| Dois cupons                                                   | Não; mantém um código por Order                      |
| Modalidade não elegível                                       | Oferta ignorada/rejeitada pelo servidor              |

Conflitos são protegidos por transaction Serializable + advisory lock em chave de conflito (store + lane + product quando aplicável). A UI explica o conflito e aponta a oferta existente.

## 17. Pricing pipeline canônico

Todos os valores são `Int` cents, finitos, seguros e não negativos.

1. validar intenção, tenant/store, entitlement, modalidade e limites de payload;
2. carregar em lote produtos, opções e ofertas candidatas; resolver agenda no timezone/clock canônico;
3. expandir combos e choices; validar limites pós-expansão;
4. calcular `subtotal` bruto de produtos + opções;
5. aplicar adjustments de combo;
6. aplicar exatamente uma lane de item por SKU: product fixed **ou** quantity **ou** BOGO;
7. congelar `itemNetBeforeCart` e aplicar no máximo um cart discount;
8. congelar `merchandiseBeforeCoupon`; validar/calcular cupom sobre essa base;
9. calcular `deliveryFee` original por zona;
10. aplicar `FREE_DELIVERY` se Delivery e base elegível;
11. `discount = SUM(OrderPriceAdjustment.amount)`;
12. `total = subtotal + deliveryFee - discount`;
13. exigir `0 <= discount <= subtotal + deliveryFee`, `total >= 0`, `Payment.amount === total`;
14. incluir versões, choices, bases, adjustments, modalidade, taxa e issues no fingerprint;
15. reexecutar dentro da transaction de Order e rejeitar fingerprint stale.

Para V1 sem frete grátis, a equação é algebricamente idêntica à atual.

## 18. Schema e migration prevista

### Tabelas/alterações

| Objeto                       | Papel                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `StoreOffer`                 | Parent canônico: kind, name, description, active/archive, schedule, version, sort, maxUses/counters |
| `StoreOfferModality`         | Modalidades relacionais com composite scope                                                         |
| `StoreCombo`                 | Subtipo preservado; adiciona vínculo ao parent e mode FIXED/FLEXIBLE                                |
| `StoreComboChoiceGroup`      | Nome, posição, min/max=1, composite scope                                                           |
| `StoreComboChoice`           | Product, priceDelta, posição e FK ao grupo/store                                                    |
| `StoreProductPromotion`      | Subtipo V1 de preço especial vinculado ao parent                                                    |
| `StoreQuantityPromotion`     | Product, requiredQuantity, groupPrice, maxApplications                                              |
| `StoreBuyPayPromotion`       | Product, takeQuantity, payQuantity, maxApplications                                                 |
| `StoreCartPromotion`         | minimumAmount, fixedDiscount                                                                        |
| `StoreFreeDeliveryPromotion` | minimumAmount                                                                                       |
| `StoreOfferUsage`            | Ledger RESERVED/CONSUMED/RELEASED/EXPIRED, único offer/order                                        |
| `OrderOfferGroup`            | kind snapshot e suporte a combo flexível sem nova tabela paralela                                   |
| `OrderItem`                  | choice/group/delta snapshots opcionais                                                              |
| `OrderPriceAdjustment`       | novos types, `scope`, `basisAmountSnapshot`, source kind snapshot                                   |

Novos adjustment types mínimos: `QUANTITY_PROMOTION`, `BUY_X_PAY_Y`, `CART_PROMOTION`, `FREE_DELIVERY`. Preservar `COMBO`, `PRODUCT_PROMOTION`, `COUPON`.

### Sequência de migration/deploy

1. **Expand**: enums/tabelas/colunas/indexes/checks/RLS/revokes/FKs compostas, sem drop.
2. **Preflight**: provar inexistência de vínculos cruzados e divergência financeira V1.
3. **Backfill**: criar `StoreOffer` para cada `StoreCombo`/`StoreProductPromotion`, manter IDs/subtipos, modalidades ALL, limite null; idempotente e verificável.
4. **Release app**: um engine lê parent/subtipo; writes V1 mantêm projeção compatível durante a janela de rollback.
5. **Observe**: pricing mismatch, usage conflict, quote failure, query timing, payment mismatch.
6. **Contract posterior**: somente outra migration futura pode remover duplicações/colunas legadas; não faz parte da V2 inicial.

Migration é aditiva, sem `db push`, `migrate reset`, aplicação remota ou reescrita de Orders históricos nesta fase. RLS segue o projeto: enable + revoke de clients; acesso server-side privilegiado documentado; constraints compostas continuam obrigatórias.

## 19. Merchant UX

Tela principal “Ofertas”, não “Campanhas”:

- lista única com benefício, agenda, uso, status e ações;
- busca e filtros visíveis; paginação no parent, sem merge em Node;
- resumo curto: ativas, pedidos concluídos, economia e oportunidades;
- métricas detalhadas somente ao abrir oferta, com Hoje/7/30;
- oportunidade pequena, evidência concreta e CTA “Criar combo”.

“Nova oferta” começa com cinco intenções, não sete termos técnicos:

1. Criar combo;
2. Dar desconto em um produto;
3. Criar promoção por quantidade — depois escolhe “N por preço” ou “leve X, pague Y”;
4. Dar desconto acima de um valor;
5. Oferecer frete grátis.

Combo flexível usa grupos “Escolha 1”, opções/produto/delta, preço base e preview sticky. Agenda, modalidades e limite ficam em “Disponibilidade”, depois da mecânica. Publicar é a única ação primária; conflito mostra oferta existente e recuperação. Toggle/list actions ficam disabled/loading durante mutation.

## 20. Storefront UX, crítica e distill

Storefront:

- ofertas ativas são resolvidas em lote e respeitam tokens white-label da loja;
- combo flexível mostra uma escolha por grupo, adicional ao lado da opção e total atualizado;
- CTA inferior permanece no alcance do polegar e só ativa quando grupos obrigatórios estão válidos;
- carrinho agrupa combo, permite editar escolhas e lista cada economia separadamente;
- mensagens de threshold usam a mesma base do servidor (“R$ 38,90 de R$ 35,00 após ofertas”);
- requote preserva carrinho, explica o que mudou e pede revisão; nunca persiste silenciosamente;
- Central explica adjustments; KDS mostra apenas produtos/preparo.

Impeccable critique V2: **30/40 (Good)**. A crítica foi executada em modo single-context porque sub-agents não foram autorizados nesta tarefa. A direção é específica e clara; P1 abertos no design da implementação: seletor das mecânicas e estados de conflito/esgotamento/requote. O detector HTML ficou degradado por parsers ausentes; inspeção localhost e screenshots reais foram usadas.

Impeccable distill determinou estes cortes:

- tipos finitos em vez de rule engine/JSON DSL;
- conflito impedido em vez de priority;
- uma cart promotion e uma free-delivery elegíveis;
- choice group V2 = escolha 1;
- cinco intenções merchant;
- cinco métricas no máximo;
- oportunidade sem preço sugerido, IA ou publicação automática;
- ledger reutilizável, sem infraestrutura nova.

## 21. Screenshots e protótipo

Protótipo navegável: `public/prototypes/combos-promotions-v2/index.html`

Rotas:

- `?screen=merchant`
- `?screen=builder`
- `?screen=storefront`
- `?screen=flexible`
- `?screen=cart`

Capturas:

1. `public/prototypes/combos-promotions-v2/screenshots/merchant-desktop-1440x900.png`
2. `public/prototypes/combos-promotions-v2/screenshots/merchant-tablet-1024x768.png`
3. `public/prototypes/combos-promotions-v2/screenshots/storefront-mobile-390x844.png`
4. `public/prototypes/combos-promotions-v2/screenshots/flexible-combo-mobile-390x844.png`
5. `public/prototypes/combos-promotions-v2/screenshots/cart-mobile-390x844.png`

Playwright abriu a URL direta do arquivo (`file:///.../index.html?screen=...`), verificou ausência de overflow horizontal e gerou as cinco capturas: **5/5 PASS**.

## Plano de implementação após aprovação

1. Hardening crítico/importante V1 e suites de regressão.
2. Migration expand/backfill/preflight local; nenhuma aplicação remota sem nova autorização.
3. Parent/subtipos, domínio puro e repository batched.
4. Pricing pipeline/stacking/invariantes/snapshots.
5. Usage ledger e integração idempotente com Order/Payment/cancel/refund.
6. Merchant forms/list/detail/metrics/opportunities.
7. Storefront/cart/checkout/Central/KDS/DINE_IN.
8. Cache/PWA/RLS/RBAC/AuditLog/observabilidade.
9. Unit/integration/concurrency/E2E/a11y/performance.
10. Impeccable audit/polish/harden e produção gate com zero CRÍTICO aberto.

## Evidência desta fase

| Verificação                       | Resultado                                                       |
| --------------------------------- | --------------------------------------------------------------- |
| Testes V1 direcionados            | PASS — 5 arquivos, 76 testes                                    |
| Protótipo Playwright              | PASS — 5/5, dimensões exigidas                                  |
| Browser localhost                 | PASS — fluxo/DOM de merchant, builder, flexible e cart          |
| Detector V1 `src`                 | 252 findings globais; maioria drift preexistente fora do módulo |
| Detector V2 HTML                  | DEGRADED — parsers ausentes; zero reportado é subcontagem       |
| Migration V2                      | SKIPPED — proibida nesta fase                                   |
| Remote DB/Cloudflare/Mercado Pago | SKIPPED — nenhuma alteração                                     |
| Commit/push/PR/deploy             | SKIPPED — proibidos nesta fase                                  |

## Rollout e rollback previstos

- rollout por loja via capability existente, começando com ofertas V1 e uma loja piloto V2;
- monitorar quote failure, pricing mismatch, usage conflict, stale quote, payment mismatch e latência SQL sem PII;
- pausar o subtipo/oferta problemática pelo próprio cadastro;
- kill switch `combosPromotionsEnabled=false` impede novos quotes/compras com oferta;
- Orders persistidos continuam legíveis e imutáveis;
- rollback do app mantém tabelas V1 e a projeção compatível da janela de rollout;
- nenhuma rollback migration destrutiva no incidente.
