# Auditoria de produção — Combos e Promoções V1

Data: 2026-08-21  
Escopo: schema/migration, domínio, cadastro, quote, carrinho, checkout, Order, Central, KDS, Reports, cupons, Mercado Pago, cache/PWA, RBAC, AuditLog, RLS e UX.  
Modo: leitura do código real, revisão de migration, detector Impeccable, inspeção visual e 76 testes direcionados. Nenhuma correção de backend foi aplicada nesta fase.

## Veredito

A fundação da V1 é boa: preço autoritativo no servidor, centavos inteiros, revalidação por fingerprint, transação Serializable, idempotência, snapshots históricos e expansão do combo em itens reais. A V1 não deve ser declarada pronta para produção enquanto o cancelamento de Pix pendente estiver aberto. Há ainda cinco hardenings importantes de aritmética, limites, integridade e fail-closed.

Classificação encontrada: **1 CRÍTICO, 6 IMPORTANTES, 5 REFINAMENTOS**.

## O que está correto e deve ser preservado

- `calculateCheckoutQuote()` resolve produto, opções, agenda, modalidade, cupom, taxa, descontos e total no servidor. O cliente envia intenção, não preços.
- A ordem V1 confirmada é `subtotal - automaticDiscount - couponDiscount + deliveryFee = total`. O cupom usa `subtotal - automaticDiscount` como base elegível.
- Multiplicações da quote usam `safeAdd`/`safeMultiply`, rejeitam valores negativos, inteiros inseguros e estouro do `Int` PostgreSQL.
- Componentes de combo não entram no mapa de promoção individual; adicionais são cobrados integralmente.
- Agenda usa timezone da loja, datas inicial inclusiva/final exclusiva, janela overnight ligada ao dia de início e comportamento correto em DST.
- Criação/reativação de promoção usa transação Serializable, retry de `P2034` e advisory lock por loja/produto antes da checagem de sobreposição.
- O storefront pode cachear definições, mas avalia agenda fora do cache; a quote autoritativa não é cacheada. Alterações relevantes invalidam tags.
- Order creation recalcula a quote dentro da transação, compara fingerprint e persiste Order, items, groups, adjustments, Payment, cupom, AuditLog e outbox atomicamente.
- Idempotência é protegida por advisory lock e unicidade por loja/chave; o caminho de repetição devolve o Order existente.
- `Payment.amount` nasce de `quote.total`; o Mercado Pago recebe o total persistido e a reconciliação compara valor e escopo do provedor.
- Store/tenant são checados em produtos, combos, promoções e quote. RBAC exige permissões de ofertas e a capability `combosPromotionsEnabled`.
- Pedidos históricos guardam nome, versão, componentes e ajustes; não dependem da oferta viva.
- Central e KDS consomem `OrderItem` real e o agrupamento do combo sem levar matemática promocional para a cozinha.
- Migration V1 é aditiva, habilita RLS nas cinco tabelas e revoga acesso de `anon`/`authenticated`, compatível com o modelo server-side privilegiado do projeto.

## Bugs e riscos

### CRÍTICO — cancelamento local de Pix pode deixar uma cobrança pagável

`cancelOrder()` permite cancelar Order/Payment em `PENDING` sem distinguir `Payment.provider`. O fluxo não encerra a cobrança Mercado Pago nem libera a `CouponReservation`. `ensureMercadoPagoPixCreated()` também não exige que o Order ainda esteja em `AWAITING_PAYMENT/PENDING` antes de criar a cobrança. Se o cliente pagar depois do cancelamento local, a matriz retorna `PAID_AFTER_LOCAL_FINAL_STATE` e abre alerta crítico; o sistema não transforma isso em Order operacional nem em refund automático.

Impacto: dinheiro recebido para pedido localmente cancelado, reserva de cupom presa até expiração e tratamento manual de suporte/financeiro.

Correção proposta:

1. impedir cancelamento local final de Payment com provider enquanto a cobrança estiver pagável;
2. adicionar guard de estado em `ensureMercadoPagoPixCreated()`;
3. criar fluxo explícito de “cancelar cobrança” somente após confirmar a operação suportada pelo provider ou aguardar terminal/expiração;
4. reconciliar imediatamente antes e depois da tentativa; se pago, direcionar a refund;
5. liberar reserva de cupom na mesma transição terminal confirmada;
6. cobrir criação tardia, pagamento tardio, retry, webhook e reconciliação periódica.

### IMPORTANTE — limite de quantidade não considera expansão do combo

O schema de checkout soma apenas `item.quantity`. Um combo aceita até 50 componentes e cada componente até 999 unidades; 99 combos podem expandir para milhões de unidades reais sem ultrapassar o limite de 250 unidades da intenção.

Impacto: carga operacional absurda no KDS/Central, OrderItems com quantidades impraticáveis e vetor de abuso mesmo quando a aritmética monetária recusa parte dos casos.

Correção proposta: limite canônico pós-expansão no servidor, com máximos de componentes, quantidade por componente, unidades expandidas, opções expandidas e linhas persistidas. O mesmo validador deve alimentar cadastro e quote.

### IMPORTANTE — aritmética auxiliar não reutiliza o money guard

Cadastro, DTO público e preview calculam `basePrice * quantity` com `number` comum (`offer.service.ts:118`, `public-store.ts:953`, `combo-form.tsx:70`). A quote usa aritmética protegida, mas a UI pode exibir economia imprecisa e o cadastro pode comparar um total já fora de faixa segura.

Correção proposta: um único módulo de dinheiro em centavos com `safeAdd`, `safeSubtract`, `safeMultiply`, `assertPostgresInt` e `assertNonNegative`, usado em domínio, serviços e DTOs. O frontend mostra somente valores já limitados pelo schema.

### IMPORTANTE — quote não falha fechada com promoções sobrepostas corrompidas

`activePromotionByProduct` é construído com `new Map(...)`. Se import, SQL privilegiado ou bug antigo deixar duas promoções elegíveis, a última linha retornada vence sem `orderBy` ou erro explícito.

Correção proposta: agrupar candidatas por produto, exigir cardinalidade `<= 1` e retornar `OFFER_CONFLICT`/log sem PII se o banco violar a invariante. Manter lock transacional no cadastro e adicionar preflight de dados.

### IMPORTANTE — FKs históricas não provam o mesmo Order/tenant/store

`order_items.offerGroupId`, `order_price_adjustments.orderItemId` e `orderOfferGroupId` referenciam somente `id`. O application service grava corretamente, mas o banco aceita referência cruzada entre Orders/lojas se um writer privilegiado falhar.

Correção proposta: uniques de apoio e FKs compostas que incluam `orderId` e, nas tabelas com escopo, `tenantId/storeId`; backfill/check antes de validar constraints. RLS continua defesa adicional, não substituto de integridade relacional.

### IMPORTANTE — equação financeira não é uma invariante executável única

Order e adjustments são gerados da mesma quote, porém não há assert final de:

- `discount === SUM(adjustments.amount)` na V1;
- `subtotal - discount + deliveryFee === total`;
- `offerGroup.discountAmount === adjustment(COMBO).amount`;
- `Payment.amount === total` imediatamente antes de persistir.

Correção proposta: `assertQuoteFinancialInvariants()` puro, chamado no fim da quote e antes do write; preflight SQL para históricos; testes property/table-driven. Na V2, frete grátis entra no total de adjustments e a equação evolui de forma documentada.

### IMPORTANTE — cobertura não testa o serviço administrativo nem a disputa real

Os testes cobrem quote, persistência, agenda e leitura, mas não há suite do `offer.service` para tenant leakage, RBAC, versão otimista, lock/overlap concorrente, reativação e archive. O caso de cancelamento tardio do Pix também está ausente.

Correção proposta: testes de serviço e integração PostgreSQL com duas transações disputando o mesmo produto/último uso; não mockar a parte cujo risco é o lock.

### IMPORTANTE — UX não cobre os estados que mais custam suporte

A experiência atual resolve o happy path, mas não especifica loading/pending nos toggles, conflito de versão, último uso esgotado, requote, produto indisponível, agenda expirada e erro recuperável. Toggle rápido pode disparar duas versões e transformar feedback previsível em conflito.

Correção proposta: desabilitar ação enquanto pendente, anunciar status, preservar formulário/carrinho, diferenciar “mudou”, “acabou” e “indisponível” e oferecer revisar/remover/tentar de novo.

## Refinamentos

1. A paginação combinada está correta quanto a itens, mas busca `page * 25` em cada tabela; custo cresce linearmente e o desempate global usa apenas `updatedAt`. A V2 deve paginar o parent `StoreOffer` ou usar `UNION ALL`/keyset com desempate tipo/id.
2. Backend aceita filtros de tipo/status; a V1 não expõe todos na UI. A V2 já os torna visíveis.
3. Detecção de sobreposição percorre minutos por até 15 dias. É aceitável para poucas candidatas, mas deve haver limite/índice e benchmark para lojas com muito histórico ativo.
4. O cadastro bloqueia combo sem economia. Isso é consistente com a implementação, porém a regra de produto deve permanecer explícita — não virar erro genérico.
5. Combo pode ser cadastrado com produto momentaneamente esgotado/indisponível e só falha na quote. Mostrar aviso no cadastro é melhor que bloquear, porque disponibilidade é transitória.

## Impeccable audit V1

O detector amplo encontrou 252 avisos no `src`, majoritariamente drift preexistente de tokens em `globals.css` e telas fora do módulo. Nas superfícies V1 de ofertas, o risco material é de estados/recuperação, não de identidade: hierarquia, linguagem, foco e agrupamento estão coerentes. A crítica V1 arquivada marcou 21/40 antes do distill anterior; os gaps restantes acima devem virar critérios de aceite da implementação.

## Testes executados nesta fase

- `src/domain/offers/schedule.test.ts`
- `tests/unit/checkout-quote-service.test.ts`
- `tests/unit/order-repository.test.ts`
- `tests/unit/order-workflow-service.test.ts`
- `tests/unit/order-query-service.test.ts`

Resultado: **5 arquivos, 76 testes, PASS**.

## Gate V1 para iniciar rollout V2

1. CRÍTICO do Pix fechado e testado.
2. Limites pós-expansão e money guard compartilhado.
3. Invariantes financeiras executáveis.
4. Quote fail-closed para conflito de dados.
5. FKs compostas/preflight de integridade.
6. Cobertura administrativa, concorrência e estados UX.

Até esse gate, a recomendação é **não declarar production-ready**.
