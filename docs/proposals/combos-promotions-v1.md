# Combos e Promoções — proposta da V1

Status: **Fase 1 / gate de arquitetura e UX**. Este documento não implementa domínio, migrations, APIs ou rollout.

## Direção consolidada

Combos e promoções entram como uma área simples chamada **Ofertas**, imediatamente depois de **Catálogo**. A V1 tem somente dois formatos:

- **Combo**: dois ou mais produtos existentes, com quantidades definidas e um preço especial para a soma dos produtos-base. Opções e adicionais continuam cobrados normalmente.
- **Promoção de produto**: um produto existente recebe um preço promocional em uma agenda simples.

Cupons continuam separados. Não há motor genérico de campanhas, condições por público, “compre X leve Y”, prioridade configurável ou substituição automática de componentes.

Tese visual: a oferta deve parecer uma parte natural do cardápio e da operação, não uma campanha de marketing. A economia é um valor verificável, preservado da criação ao carrinho.

## 1. Auditoria do pricing atual

O ponto canônico de preço é `calculateCheckoutQuote()` em `src/server/services/checkout-quote.service.ts`.

Hoje ele:

- carrega loja, configurações, entitlement de salão e disponibilidade;
- busca os produtos do carrinho em lote, com categoria, grupos de opções e opções;
- valida escopo de tenant/loja, arquivamento, disponibilidade, quantidades e opções reais;
- calcula `unitPrice = product.basePrice + optionsTotal` e `itemTotal = unitPrice × quantity` em centavos inteiros;
- calcula entrega, pedido mínimo e cupom no servidor;
- devolve linhas, issues, totais e `quoteFingerprint`;
- não confia no preço persistido pelo carrinho.

O navegador mantém `basePrice`, opções e `unitPrice` apenas para feedback imediato. `cart-view.tsx`, `useCartQuote` e `useCheckoutQuote` substituem esses valores pelo quote do servidor e impedem checkout sem quote válido.

Na criação do pedido, `src/server/repositories/order.repository.ts` executa novamente a mesma cotação dentro de transação `Serializable`, compara `expectedQuoteFingerprint` e só então grava Order, OrderItems, Payment, cupom, auditoria e outbox. O fingerprint atual muda quando linhas, opções, preços ou totais mudam, mas ainda não carrega versões explícitas de oferta porque ofertas não existem.

Invariantes que a V1 deve preservar:

```text
Order.subtotal + Order.deliveryFee - Order.discount = Order.total
Payment.amount = Order.total
Order.discount >= 0
Order.total >= 0
```

## 2. Auditoria de Coupon

`Coupon` é explícito e robusto: `PERCENTAGE` ou `FIXED`, valor mínimo, teto de desconto, limite de usos, ativação, início e expiração. O checkout considera início inclusivo e expiração exclusiva.

O desconto percentual usa piso inteiro e o desconto nunca ultrapassa subtotal ou `maxDiscount`. A criação do pedido bloqueia a linha popular do cupom e verifica concorrência de usos. Pedidos não online criam `CouponUsage` imediatamente. Mercado Pago usa `CouponReservation`; pagamento aprovado consome a reserva, falha/cancelamento libera e a reconciliação expira reservas antigas.

A V1 não substitui essa mecânica. `CouponUsage` e `CouponReservation` continuam sendo a fonte de verdade do ciclo de uso. O novo ledger de ajustes registra o efeito financeiro do cupom no pedido, mas `CouponReservation.discount` continua contendo **somente o desconto do cupom**, nunca o desconto automático total.

## 3. Entitlement

Adicionar um único flag canônico:

```text
StoreEntitlement.combosPromotionsEnabled Boolean @default(false)
```

Ele também entra em `STORE_FEATURE_DEFINITIONS`, schemas, selects, locks, auditoria e formulário de Super Admin. Não criar flags separadas para combo e promoção.

Quando desligado:

- `Ofertas` fica oculto no merchant;
- rotas e actions de gestão recusam acesso no servidor;
- catálogo público não expõe ofertas novas;
- quote recusa entradas de combo e não aplica promoções automáticas;
- pedidos históricos continuam exibindo seus snapshots e ajustes, sem consultar o entitlement atual.

## 4. Modelagem de Combo

Modelo explícito, sempre escopado por tenant e loja:

```text
StoreCombo
  id, tenantId, storeId
  name, description?
  specialPrice                    // centavos, > 0
  isActive, sortOrder, version
  startsOn?, endsOnExclusive?     // datas locais da loja
  weekdays[]                      // vazio = todos
  startMinute?, endMinuteExclusive?
  archivedAt?, createdAt, updatedAt

StoreComboItem
  id, tenantId, storeId, comboId
  productId
  quantity                        // inteiro > 0
  position
```

Regras:

- no mínimo dois componentes relevantes;
- uma linha por produto; adicionar o mesmo produto incrementa a quantidade;
- `@@unique([comboId, productId])`;
- todos os produtos pertencem à mesma loja/tenant;
- produto inexistente, arquivado, indisponível ou esgotado invalida o combo inteiro;
- não há substituição automática;
- mudanças de preço dos componentes não alteram `specialPrice`;
- opções do produto real continuam sendo as opções do componente;
- o combo só fica comprável quando o total atual dos produtos-base for maior que `specialPrice`. Se uma alteração posterior eliminar a economia, ele é suprimido da vitrine e o quote retorna oferta indisponível até o lojista ajustar o valor.

`version` é incrementado em qualquer mudança que altere preço, componentes, agenda ou disponibilidade e participa do quote/fingerprint.

## 5. Modelagem de Promotion

```text
StoreProductPromotion
  id, tenantId, storeId
  productId
  promotionalPrice                // centavos, > 0
  isActive, version
  startsOn?, endsOnExclusive?     // datas locais da loja
  weekdays[]                      // vazio = todos
  startMinute?, endMinuteExclusive?
  archivedAt?, createdAt, updatedAt
```

Regras:

- `promotionalPrice < Product.basePrice` na criação/edição;
- a promoção afeta somente o preço-base; opções mantêm o valor normal;
- produto arquivado, indisponível ou com preço-base menor ou igual ao promocional torna a promoção inaplicável;
- promoções ativas/agendadas do mesmo produto não podem ter janelas sobrepostas;
- a verificação de sobreposição ocorre sob lock transacional por `(storeId, productId)`, evitando duas criações concorrentes;
- não há prioridade: sobreposição é erro de validação, com indicação da promoção conflitante.

## 6. Modelagem de snapshots

Componentes continuam sendo `OrderItem`, preservando cozinha e ranking de produtos. Adicionar duas estruturas:

```text
OrderOfferGroup
  id, tenantId, storeId, orderId
  offerType                       // COMBO na V1
  sourceOfferIdSnapshot
  sourceOfferVersion
  nameSnapshot
  quantity, position
  regularBaseAmount
  offerBaseAmount
  discountAmount

OrderPriceAdjustment
  id, tenantId, storeId, orderId
  adjustmentType                  // COMBO | PRODUCT_PROMOTION | COUPON
  sourceIdSnapshot?
  sourceVersion?
  labelSnapshot
  amount                          // desconto positivo em centavos
  orderItemId?
  orderOfferGroupId?
  position
```

Adicionar a `OrderItem`:

```text
offerGroupId?
offerComponentPosition?
```

Semântica dos itens:

- `OrderItem.unitPrice` e `itemTotal` continuam representando valores brutos do produto atual + opções, como hoje;
- descontos são ajustes separados, não preços negativos escondidos nos itens;
- para combo, `OrderOfferGroup.quantity` representa quantos combos foram comprados e as quantidades dos OrderItems refletem essa multiplicação;
- o navegador envia uma configuração comum por linha de combo; configurações diferentes viram linhas/grupos diferentes;
- `sourceOfferIdSnapshot` não depende da sobrevivência da oferta original;
- pedidos antigos permanecem válidos sem groups/adjustments. DTOs fazem fallback para `Order.discount` e dados de cupom existentes.

## 7. Política de stacking

Política proposta:

1. preços correntes dos produtos e opções formam o subtotal bruto;
2. componentes dentro de combo **não** recebem promoção de produto;
3. um produto avulso recebe no máximo uma promoção, garantido pela regra de não sobreposição;
4. desconto do combo = soma atual dos preços-base dos componentes − `specialPrice`, multiplicado pela quantidade do combo;
5. opções e adicionais nunca entram no desconto automático;
6. promoções e combos podem coexistir no mesmo pedido em linhas diferentes;
7. cupom pode empilhar com ofertas automáticas;
8. a base elegível do cupom é o valor de mercadoria restante após descontos automáticos, ainda incluindo opções e excluindo entrega;
9. `minOrderValue` do cupom é verificado nessa base pós-ofertas;
10. entrega nunca recebe desconto na V1.

Exemplo do protótipo:

```text
Produtos-base do combo             R$ 52,80
Preço especial                     R$ 46,90
Adicional bacon                    R$  4,00
Subtotal bruto                     R$ 56,80
Ajuste COMBO                      -R$  5,90
Total parcial                      R$ 50,90
```

`Order.discount` passa a ser a soma de todos os ajustes. A mudança da base de cupom é deliberada e exige testes de regressão porque hoje o cupom usa o subtotal bruto.

## 8. Pricing flow

O browser envia intenção, nunca preço ou desconto:

```text
PRODUCT
  clientLineId, productId, quantity, optionIds, notes

COMBO
  clientLineId, comboId, quantity
  components[]: comboItemId, optionIds, notes
```

Para `COMBO`, o servidor resolve produto e quantidade a partir da definição. `comboItemId` serve somente para associar escolhas de opções ao componente e é validado contra a definição completa.

Fluxo canônico no quote:

1. carregar Store, `timeZone`, settings e entitlement;
2. normalizar a intenção;
3. carregar produtos, opções, combos e promoções candidatas em lote;
4. validar tenant/loja, versões, arquivamento, disponibilidade, agenda e composição;
5. construir linhas brutas reais;
6. aplicar ajustes automáticos de combo e promoção;
7. calcular a base pós-ofertas e aplicar cupom;
8. calcular entrega e total;
9. devolver linhas, groups, adjustments, issues e totais;
10. incluir IDs/versões de ofertas e todos os valores derivados no `quoteFingerprint`.

Na criação do pedido, executar o mesmo fluxo na transação `Serializable`. Se preço, disponibilidade, agenda, versão ou composição mudou, o fingerprint muda e o cliente recebe requote. Início é inclusivo; fim é exclusivo.

Agenda usa os componentes locais produzidos por `Store.timeZone`, reutilizando `src/lib/time/store-time.ts`. Não persistir offset fixo nem gerar ocorrências por cron. Janelas que cruzam meia-noite usam o dia de início e são avaliadas contra o dia local anterior após 00h. Testes devem cobrir DST com zonas que o praticam, embora a loja fictícia use Fortaleza.

## 9. Merchant UX

- nova navegação **Ofertas** após Catálogo;
- listagem única, com filtros Todas/Combos/Promoções;
- ação única **Criar oferta**;
- escolha inicial entre Combo e Promoção de produto;
- combo em três blocos: identificação, componentes e preço;
- preço separado é derivado e somente leitura;
- economia é recalculada imediatamente;
- promoção em três blocos: produto, preço e disponibilidade;
- CTA direto **Publicar combo/promoção**; drafts ficaram fora da V1;
- Cupons continuam em navegação própria.

Permissions propostas: `VIEW_OFFERS` e `MANAGE_OFFERS`. OWNER e MANAGER recebem ambas; ATTENDANT não recebe. O entitlement e a permission são conferidos no servidor, não apenas na navegação.

## 10. Storefront

- seção Ofertas aparece antes das categorias comuns quando houver oferta ativa;
- combo usa foto, composição, preço separado riscado, preço especial, economia e “Escolher opções”;
- promoção de produto usa o mesmo card do produto, com preço anterior e promocional;
- fora da agenda ou sem economia real, a oferta não é acionável nem exposta como ativa;
- domínio customizado usa o mesmo resolver de loja, portanto não requer fluxo paralelo;
- JSON-LD mantém o preço-base na V1 para evitar anunciar preço temporário/stale.

Cache: não persistir “está ativa agora” dentro do cache público de catálogo de 60 segundos. Cachear definições com tag própria (`store-offers:<storeId>`), invalidar em criação/edição/pausa/arquivamento e avaliar a agenda no request. O service worker continua network-first para HTML público e network-only para cart/checkout; nenhuma oferta entra no CacheStorage sensível.

## 11. Combo configuration

- componentes aparecem na ordem definida pelo lojista;
- cada componente reutiliza seus `ProductOptionGroup` e `ProductOption` reais;
- obrigatoriedade, limites e preço adicional seguem as regras atuais;
- nenhum catálogo paralelo de “opções de combo”;
- preço especial fica fixo na barra inferior; adicionais atualizam o total local apenas como preview;
- quote do servidor confirma tudo antes do checkout;
- quantidade maior que um compartilha a mesma configuração. Configurações diferentes criam duas linhas de combo.

## 12. Cart

- combo permanece agrupado visualmente;
- componentes e escolhas ficam legíveis dentro do grupo;
- adicionais aparecem separadamente;
- resumo mostra subtotal bruto, economia automática, cupom quando houver, entrega e total;
- mudança de preço/disponibilidade preserva o carrinho e oferece remover/revisar a linha afetada;
- mesma cotação para DELIVERY, PICKUP e DINE_IN.

## 13. KDS

O KDS continua sem informação financeira. `getKdsSnapshot` passa a devolver o vínculo opcional do item com `OrderOfferGroup`. A interface pode mostrar um rótulo discreto “Combo X-Bacon” e os componentes abaixo. Preço, desconto e economia não aparecem na cozinha.

## 14. Central

Detalhe do pedido exibe:

- grupo do combo e componentes reais;
- subtotal bruto;
- descontos de Combo e Promoção;
- cupom separado;
- entrega e total;
- snapshots, mesmo se a oferta foi pausada/arquivada ou o entitlement desligado.

Pagamento e status operacional permanecem apoiados em `Order.total` e nos fluxos atuais.

## 15. Desktop

A lista em `1440×900` usa linha operacional, não grade de métricas. Nome, tipo, preço, economia, agenda e status são comparáveis sem abrir cada oferta. Uma única ação primária cria oferta.

## 16. Tablet

Em `1024×768`, o editor mantém formulário e prévia de preço lado a lado. A prévia preserva componentes, preço separado e preço especial no primeiro viewport. Navegação colapsada deve manter `aria-label`, `title`/tooltip e foco visível.

## 17. Mobile

Em `390×844`, ofertas lideram o cardápio sem transformar a tela em campanha. Configuração e carrinho usam CTA inferior, alvos de toque de pelo menos 44 px e texto essencial legível. Economia permanece até o total.

## 18. Migration prevista

Migration expand-only, antes do código que a usa:

1. adicionar `combosPromotionsEnabled` com default `false`;
2. criar `store_combos`, `store_combo_items`, `store_product_promotions`, `order_offer_groups` e `order_price_adjustments`;
3. adicionar `offerGroupId` e `offerComponentPosition` nullable a `order_items`;
4. criar composite FKs de tenant/store, índices de consulta e políticas RLS;
5. adicionar checks de preço/quantidade/minutos e unicidade de produto por combo;
6. não fazer backfill obrigatório de pedidos históricos;
7. subir aplicação com o flag desligado;
8. habilitar por loja somente depois de preflight e smoke tests.

Índices mínimos:

- ofertas por `(tenantId, storeId, isActive, archivedAt)`;
- promoções por `(tenantId, storeId, productId, isActive, archivedAt)`;
- componentes por `(comboId, position)` e unique `(comboId, productId)`;
- groups e adjustments por `(orderId, position)`;
- adjustments por `(tenantId, storeId, adjustmentType, createdAt)` para análise futura.

## 19. Riscos

### CRITICAL

- **Reconciliação financeira:** mudar `Order.discount` de cupom-only para soma de ajustes sem quebrar `Payment.amount`, reservas, reembolso, relatórios e webhooks.
- **Quote/idempotência na transição de agenda:** expiração entre carrinho e criação deve produzir requote, nunca preço antigo ou pedido duplicado.
- **Snapshot de combo:** grouping, quantidades e opções precisam permanecer exatos para cozinha, Central, reembolso e histórico.

### IMPORTANT

- concorrência ao impedir promoções sobrepostas;
- avaliação de agenda local e DST sem offset fixo;
- cache público de 60 s exibindo oferta expirada se a verdade temporal for cacheada;
- RLS/composite FKs em todas as tabelas novas;
- produto ficar indisponível ou perder economia depois que o combo entrou no carrinho;
- desligar entitlement sem ocultar pedidos históricos;
- manter `CouponReservation.discount` separado do desconto automático;
- payload/fingerprint crescer com grupos e componentes.

### REFINEMENT

- nomes longos e combos com dez componentes;
- ordenação manual de ofertas;
- atalhos e ações em lote para lojistas com muitas ofertas;
- analytics específicos por oferta, adiados mas viabilizados pelo ledger;
- refinamento de empty/loading/error states na implementação.

## Testes obrigatórios na Fase 2

- unitários do evaluator de agenda: início inclusivo, fim exclusivo, weekdays, virada de meia-noite e DST;
- matriz de pricing: produto normal, promoção, combo, combo + adicionais, combo + produto promocional + cupom, cupom fixo/percentual/teto/mínimo;
- arredondamento e limites inteiros;
- combo sem economia, componente removido/arquivado/esgotado, oferta pausada/expirada;
- duas promoções concorrentes para o mesmo produto;
- quote fingerprint alterado por versão/preço/agenda/disponibilidade;
- idempotência e retry `Serializable`;
- reservation/usage do cupom e Mercado Pago;
- KDS sem valores, Central com ajustes, ranking com componentes;
- entitlement desligado e pedidos históricos;
- storefront, custom domain, DELIVERY, PICKUP, DINE_IN e PWA;
- desktop, tablet e mobile; teclado, foco, leitor de tela, contraste e alvos de toque.

## Protótipo e evidências

Protótipo isolado: `public/prototypes/combos-promotions/index.html`.

Rotas:

- `?screen=merchant`
- `?screen=choose`
- `?screen=combo`
- `?screen=promotion`
- `?screen=storefront`
- `?screen=configure`
- `?screen=cart`

Capturas reais:

- `public/prototypes/combos-promotions/screenshots/merchant-desktop-1440x900.png`
- `public/prototypes/combos-promotions/screenshots/merchant-tablet-1024x768.png`
- `public/prototypes/combos-promotions/screenshots/storefront-mobile-390x844.png`
- `public/prototypes/combos-promotions/screenshots/cart-mobile-390x844.png`

Imagem fictícia criada com o Imagegen integrado e salva em `public/prototypes/combos-promotions/combo-x-bacon.png`.

Prompt registrado:

> Fotografia gastronômica fotorrealista, horizontal, de um combo de hamburgueria de bairro brasileira: X-Bacon com queijo e bacon, porção de batatas fritas e copo de refrigerante com gelo, sobre mesa de madeira escura, luz quente de restaurante, composição simples para card de cardápio, sem pessoas, sem texto, sem logotipos e sem marcas.

## Resultado da critique e do distill

A critique independente encontrou uma base visual específica e coerente, com economia verificável e boa taxonomia, mas apontou contrato confuso de salvar/rascunho, microtexto, alvos pequenos, remoção escondida no editor mobile, agenda sem guardrails e ausência de estados de erro.

O distill aplicado ao protótipo:

- removeu drafts da V1 e tornou a ação **Publicar**;
- removeu a busca prematura da lista;
- converteu datas/horas em controles próprios e traduziu a timezone para linguagem humana;
- preservou remover no editor mobile;
- elevou alvos de toque, foco visível e texto essencial;
- trocou ações ambíguas por “Ver” e “Ir para entrega”;
- removeu um skeleton decorativo e uma nota redundante do carrinho.

O detector rodou uma vez em modo degradado por ausência de parsers opcionais: 124 findings (3 warnings contextualmente falsos positivos e 121 advisories). O sinal útil foi a alta incidência de tipografia de 8–13 px; os tamanhos essenciais mobile foram corrigidos no distill. Não houve overlay confiável porque o navegador integrado bloqueou `file://` e `localhost`; as quatro screenshots Playwright reais foram usadas como evidência visual.
