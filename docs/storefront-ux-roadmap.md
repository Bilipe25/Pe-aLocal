# Cardápio público — plano de refinamento para produção

> Documento de planejamento. **Não altera código** por si só; acompanha o status
> dos refinamentos executados. Ele lista, justifica e prioriza melhorias para que
> a página de cardápio (`src/app/[storeSlug]`) ofereça uma experiência de
> consumidor pronta para produção, sem perder a disciplina arquitetural já
> estabelecida pelo projeto (multi-tenant, PII, R2, OpenNext, Playwright/a11y,
> white-label).

---

## 1. Onde estamos hoje (panorama)

A página `src/app/[storeSlug]/page.tsx` é um Server Component que carrega, em
paralelo, `getPublicStoreBySlug`, `getPublicCatalog` (cacheado com tag por
loja), `getPublicDeliveryZones` e `getRecentPurchasedProductsForCurrentDevice`.
O layout aplica tema white-label, gera `metadata` (canonical, OG, robots,
favicon) e envolve a árvore em `StorefrontHero` + `CatalogView` +
`StorefrontBottomNav`.

**Pontos já fortes** que devem ser preservados:

- Multi-tenancy e validação por escopo composto (`tenantId` + `storeId`).
- Cache de leitura pública via `unstable_cache` com `revalidate` e `tags`.
- DTOs públicos enxutos (`src/types/storefront.ts`) sem campos administrativos.
- Catálogo carregado no servidor + busca com `useDeferredValue` no cliente.
- `ProductImage` com `srcSet`/`sizes` do R2, `loading="lazy"`, fallback
  controlado e `IntersectionObserver` para o skeleton.
- Modal de produto com `Dialog` do Radix, `onOpenAutoFocus` no botão anterior
  e gerenciamento de cache de 60s.
- Acessibilidade: `axe` configurado, landmarks, `aria-busy`, anúncios
  `aria-live` em buscas, modais, cupom e adição ao carrinho.
- Identidade visual canônica (Papel/Tinta/Pimenta/Erva/Azulejo/Kraft) e tokens
  de tipografia (Bricolage/Inter/Space Mono).
- Personalização por loja via `StoreCustomizationConfig` (paleta, tipografia,
  layout template, presets visuais, ordem de seções, navegação de categorias).
- Status da loja calculado por `getEffectiveStoreAvailability` e exposto no
  hero e no `ProductModal`.
- Telemetria leve de storefront (`reportStorefrontEvent`) com
  `keepalive`/`sendBeacon`.
- Carrinho Zustand com persistência v2 por loja, sincronização entre abas via
  `storage` event e migração do legado v1.
- Bottom nav com 3 destinos (Cardápio/Carrinho/Meu pedido) e feed de status
  "Você ainda não tem um pedido recente nesta loja" — validado por
  Playwright.

**Lacunas observadas** que afetam a percepção de "pronto para produção" do
consumidor:

1. SEO local e descoberta: sem `JSON-LD` (Restaurant/Menu/MenuItem), sem
   sitemap por loja, sem Open Graph por item.
2. PWA e offline: sem `manifest`, sem service worker, sem página de "estamos
   sem conexão".
3. Estados operacionais visíveis: o `StoreClosedBanner` existe, mas **não é
   usado** em `page.tsx`; a loja fechada mostra só o motivo no hero, sem um
   destaque de página cheia.
4. Polimento de busca e descoberta: sem atalho de teclado, sem destaque de
   termo, sem sugestões de categoria, sem contagem em tempo real durante a
   digitação.
5. Confiança no produto: sem tag de "novo"/"mais pedido"/"promoção" (campo
   ainda não existe no schema), sem selos de alérgeno/vegano, sem
   microinteração ao adicionar à sacola.
6. Conversão: o modal de produto fecha imediatamente após adicionar — não há
   "Adicionar e continuar pedindo" nem mini-confirmação inline.
7. Carrinho: o `CartFab` recoloca a contagem via `key={count}` (re-monta o
   span a cada mudança) e não mostra nada além do total; a página `/cart` não
   exibe horário/status da loja nem o ETA prometido pelo `quote`.
8. Páginas de erro/loading: já há skeleton e error boundary; falta um estado
   "Sem internet" e um fallback de "imagem indisponível" mais humano.
9. Acessibilidade pontual: `prefers-reduced-motion` está parcialmente
   respeitado; animações de "section-reveal" e shimmer merecem revisão.
10. Performance: o catálogo inteiro é serializado no RSC e re-hidratado
    sempre; imagens usam `<img>` e não o binding `IMAGES` do Cloudflare
    (perde resize/format on the fly).

Estes pontos alimentam as fases a seguir.

---

## 2. Princípios do plano

1. **Não regredir contratos públicos.** Tudo que entrar no DTO público
   (`src/types/storefront.ts`) precisa ser estável e opt-in.
2. **Multi-tenant seguro.** Qualquer personalização nova passa por
   `StoreCustomizationConfig` (v2) e `customizationEditor`, com seed de
   defaults por preset.
3. **Server-first.** Detalhes sensíveis (preço final, disponibilidade,
   promoções) continuam calculados no servidor. O cliente só refina UX.
4. **Testado por padrão.** Cada fase produz suíte Vitest + Playwright + axe
   WCAG A/AA, sem precisar de `E2E_ALLOW_MUTATIONS` para o que é leitura.
5. **Tokens canônicos.** Toda nova cor/componente consome `papel`, `tinta`,
   `pimenta`, `erva`, `azulejo`, `kraft` e `font-display`/`font-body`/
   `font-mono`. Nada de `gray-*`/`blue-*` solto.
6. **Rollout independente.** Cada fase pode ser publicada em produção
   isoladamente e ter rollback por revert do deploy, sem migration destrutiva
   (mantendo o padrão de `expand → backfill → guard` da Fase 8/9/10).

---

## 3. Roadmap por fase

### Fase A — Polimento sem mudança de schema (curto prazo, alto impacto)

> Sem migrations, sem novas colunas. Apenas melhorias de UX, copy,
> performance e estados. Pode entrar como uma série de PRs pequenos.

| # | Status | Refinamento | Arquivos-alvo | Por que | Como medir |
|---|--------|-------------|---------------|---------|------------|
| A1 | ✅ | Banner superior contextual quando a loja está fechada, pausada ou fora do horário | `src/app/[storeSlug]/page.tsx`, `src/components/storefront/store-closed-banner.tsx` | O `StoreClosedBanner` já existe mas não era renderizado. Mostrar um banner fixo no topo melhora a clareza e reduz pedidos "fantasma" no carrinho. | Playwright: hero renderiza + banner visível com `availability.state` fechado. axe: 0 violações. |
| A2 | ⬜ | Atalho "/" foca a busca; "Esc" limpa | `src/components/storefront/storefront-search.tsx`, `src/components/storefront/catalog-view.tsx` | Atalho de teclado é convenção forte em catálogos (iFood, Rappi, Shopify). | Playwright: `/` move foco para `input#storefront-search`. |
| A3 | ✅ | Contador ao vivo "X produtos" enquanto digita | `src/components/storefront/catalog-view.tsx` | O `aria-live` já existe; falta o contador visual discreto no topo do catálogo. | E2E: digitar "x" mostra contador. |
| A4 | ⬜ | "Adicionar e continuar" + confirmação inline no modal | `src/components/storefront/product-modal.tsx` | Hoje o modal fecha após o `addItem`. Para catálogos com média de 2-3 itens por pedido, manter o modal aberto e mostrar um "Adicionado ✓" reduz cliques. | E2E: adicionar 2 itens diferentes no mesmo modal. |
| A5 | ✅ | "Continuar comprando" no `/cart` e indicador de "X itens faltam para o mínimo" no catálogo | `src/components/storefront/cart-view.tsx`, `src/app/[storeSlug]/page.tsx` | A `missingForMinimum` já vem no quote. Mostrar no hero/cart unifica a expectativa. | E2E: carrinho com `missingForMinimum > 0` mostra progresso. |
| A6 | ✅ | Skeleton com shimmer para o cardápio e para `ProductImage` | `src/app/[storeSlug]/loading.tsx`, `src/components/storefront/product-image.tsx` | O placeholder genérico com `ImageOff` é frio. Skeleton com `prefers-reduced-motion: reduce` desativa a animação. | Lighthouse: LCP percebido. |
| A7 | ✅ | Mensagem de "Sem internet / reconectando" + revalidação automática | `src/components/storefront/network-status.tsx` (novo) | Em filas/locais fracos, o `fetch` de `loadProductDetail` falha silenciosamente em modo "error". Um banner informa quando a conexão cai e some automaticamente ao voltar. | E2E simulado: `navigator.onLine = false`. |
| A8 | ⬜ | Página de erro do segmento mais humana (com link direto para o cardápio raiz) | `src/app/[storeSlug]/error.tsx` | Já existe; refinar copy e incluir `StorefrontBottomNav` se for erro de hydration. | axe + visual review. |
| A9 | ⬜ | "Compartilhar" expandido: copiar código curto do item, linkar WhatsApp com texto pré-formatado | `src/components/storefront/storefront-share-button.tsx` | Conversão por WhatsApp é o canal de aquisição predominante. | Manual + E2E com `navigator.share = undefined`. |
| A10 | ✅ | Cache público e deduplicação de `getPublicStoreBySlug` / `getPublicCatalog` | `src/server/queries/public-store.ts` | Garantir que as queries públicas não dependam de `cookies`/`headers` e que sejam deduplicadas dentro do mesmo request. Permite edge caching e reduz latência. | `pnpm test` + `pnpm tsc`. |

### Fase B — Sinais operacionais e confiança (curto-médio prazo)

> Sem migrations destrutivas. Algumas mudanças requerem colunas aditivas
> (`promoPrice`, `isNew`, `purchaseCount30d`) cobertas pelo padrão
> expand → backfill → guard.

| # | Refinamento | Por que | Como medir |
|---|-------------|---------|------------|
| B1 | **ETA dinâmico por loja** (não só "30-45 min") com base no `PromiseFulfillmentMinAt/MaxAt` vindo do `quote` | O cálculo já existe; basta renderizar. Reduz ansiedade do cliente. | E2E: hero e `/cart` mostram ETA. |
| B2 | **Tempo real do pedido no `/cart`** quando o cliente já tem pedido em andamento | O `useCustomerOrderTracking` já existe; mostrar um banner "Seu pedido #42 está em preparo" no topo do `/cart` quando o `lastOrder` é o mesmo slug. | E2E: cliente com pedido ativo vê banner. |
| B3 | **Tags no produto**: "Novo", "Mais pedido", "Promoção" | Requer colunas aditivas em `Product` (`isNew`, `popularity30d`, `promoPriceCents`, `promoEndsAt`). Schema já prevê `version` para CAS. | Migração expand → backfill → guard. |
| B4 | **Selos alimentares** (vegano, sem glúten, contém lactose) | Requer nova tabela `ProductDietaryTag` N:N. Default vazio, opt-in. | Migração aditiva. |
| B5 | **Promoções por horário** (ex.: "Happy hour 17h-19h") | Reuso de `StoreScheduleException` mais um `ProductDiscountSchedule`. Já temos `version`. | Migração aditiva. |
| B6 | **Cupom visível no hero** quando o cliente chega com `?coupon=` | O `initialCouponCode` já é propagado. Falta o hero mostrar "Cupom X aplicado" antes do `/cart`. | E2E: `?coupon=...` mostra badge. |
| B7 | **Mini-cart (peek)** ao tocar no `CartFab` | Hoje o FAB navega direto. Adicionar um popover com últimas linhas + total antes de ir para `/cart` reduz idas e voltas. | Componente novo. |
| B8 | **Confirmação visual ao favoritar** (heart pulse + haptic feedback) | `useFavoritesStore` já existe. Refinar animação. | Manual + axe. |

### Fase C — Descoberta, SEO e PWA (médio prazo)

> Esta fase aumenta drasticamente a aquisição orgânica e a percepção
> profissional. Requer cuidado com manifest, sitemap e service worker em
> Cloudflare Workers (sem `public/`, sem `next-pwa`).

| # | Refinamento | Por que | Como medir |
|---|-------------|---------|------------|
| C1 | **`JSON-LD` por página** | Schema.org `Restaurant` + `Menu` + `MenuSection` + `MenuItem` + `Offer` para destacar preço, disponibilidade e tempo de preparo. | Google Rich Results Test. |
| C2 | **Sitemap dinâmico** por loja | `app/sitemap.xml/route.ts` agregando `getAllPublicStoreSlugs` + `<lastmod>` baseado em `updatedAt` do catálogo. | `pnpm test:e2e` navegando o sitemap. |
| C3 | **`robots.txt` por loja e `noindex` para fora de catálogo** | O `indexable` da `StoreCustomizationConfig` já controla a home; estender para `/cart`, `/checkout`, `/order/...`. | curl + asserts. |
| C4 | **PWA manifest** próprio (sem DPush) | `public/manifest.webmanifest` com ícones por preset + `theme_color` da paleta da loja. | Lighthouse PWA. |
| C5 | **Service worker mínimo** (cache-first para `/api/store-assets`, stale-while-revalidate para HTML do cardápio) | O runtime é OpenNext/Workers — usar `workbox-window` ou um SW manual. Sem `next-pwa`. | Lighthouse. |
| C6 | **Página offline** ilustrada ("Sem conexão. Seu pedido anterior está salvo.") | O `useCartStore` já persiste local; basta um fallback `app/offline/page.tsx`. | Manual. |
| C7 | **Open Graph dinâmico por item** | `app/[storeSlug]/p/[productId]/page.tsx` (route nova, sem checkout) com `generateMetadata` rico e link `Ver no cardápio`. | OG Debugger. |
| C8 | **Compartilhar com imagem renderizada** (Share Image via Cloudflare Images) | Reuso do binding `IMAGES`. | Manual. |

### Fase D — Inteligência de catálogo e personalização (médio-longo prazo)

> Onde a customização encontra o comportamento. Mantém o contrato público
> `PublicStorefrontProductSummaryDto` enxuto, mas adiciona fontes de ranking
> server-side.

| # | Refinamento | Por que | Como medir |
|---|-------------|---------|------------|
| D1 | **Recomendação também no cardápio** (não só no carrinho) | Reaproveita `/api/storefront/.../recommendations` para "Combina com" abaixo do hero. | E2E. |
| D2 | **Ordenação por popularidade local** | Ranking 30d calculado no servidor (`getPopularProductsByStore`), nunca exposto no DTO. | A/B com feature flag via `StoreCustomizationConfig.experimental`. |
| D3 | **Filtro por faixa de preço** | Slider de range que envia `minPrice/maxPrice` no `?` da URL para deep-linking. | E2E. |
| D4 | **Sugestão automática de adicionais** com base no `cartItem.fingerprint` | A `cart-validator.ts` já tem `selectedOptions`; adicionar `recommendationSet` por opção. | A/B. |
| D5 | **"Pediu junto"** no modal (carrossel horizontal de produtos que costumam acompanhar) | Mesmo motor de `cart-recommendations`, sinal "frequentemente comprados juntos". | A/B. |
| D6 | **Modo "Pedido salvo"** (cliente volta 1 dia depois e a sacola ainda está lá com a data) | Já persiste; falta UI de "Sacola de ontem — retomar?". | E2E com `cart.requiresWrite`. |
| D7 | **Histórico de pedidos públicos** com opt-in do cliente | Reusa `last-order-store` + `/api/orders/track`. Banner "Outros pedidos seus". | Opt-in via `customer-recognition`. |

### Fase E — Qualidade de produção, polimento, motion (paralelo, contínuo)

| # | Refinamento | Por que | Como medir |
|---|-------------|---------|------------|
| E1 | **Adotar `next/image` com o binding `IMAGES` do Cloudflare** para todas as imagens do cardápio (logo, cover, produto, banner, categoria) | Hoje é `<img>` com `srcSet`. Trocar para `next/image` com loader do `IMAGES` libera AVIF/WebP on the fly e LCP. | Lighthouse LCP. |
| E2 | **Code-split de `CatalogView`** com `dynamic` (mantendo o SSR do server component) | `docs/storefront-catalog-payload.md` já sinaliza 268 KiB. Extrair o modal e a busca em um `next/dynamic` reduz JS inicial. | `pnpm build` + comparação. |
| E3 | **SWR / cache do `quote`** | Hoje o `useCartQuote` refaz a cada mudança. Implementar debounce de 300 ms e `stale-while-revalidate` para evitar pingue-pongue. | `pnpm perf:orders:load`. |
| E4 | **Animações honrando `prefers-reduced-motion`** em `section-reveal` e `storefront-featured-track` | Boa prática de acessibilidade. | axe + manual. |
| E5 | **Testes de regressão visual** (Playwright snapshots) por preset (`CLASSIC`, `MODERN`, `DARK_PREMIUM`, etc.) | Garantir que mudanças de tema não quebrem layout. | `pnpm test:e2e` com `toHaveScreenshot`. |
| E6 | **Auditoria de imagens quebradas** com telemetria de `onError` em `ProductImage` | Hoje o `failedUrl` apenas esconde a imagem. Subir evento `product_image_failed` para o dashboard do lojista. | Já é trivial. |
| E7 | **Internacionalização** preparada (en/es) | Hoje 100% pt-BR. Mover textos para `messages/pt-BR.json` (estrutura flat, sem i18n runtime) para reduzir retrabalho. | Lint de chaves faltantes. |
| E8 | **Doc de "Operação da home"** em `docs/storefront-runbook.md` | Complementar `phase-10-production-readiness.md` com checklist pós-deploy de cardápio (smoke manual, LCP, axe, JSON-LD). | Manual. |

---

## 4. Detalhamento técnico dos itens críticos

### A1 — Banner superior de loja fechada

**Hoje**: `store-closed-banner.tsx` existe e já consome `EffectiveStoreAvailability`. Nunca é montado em `page.tsx`.

**Plano**:

- Em `src/app/[storeSlug]/page.tsx`, antes do `StorefrontHero`, renderizar
  `<StoreClosedBanner availability={store.availability} />` quando
  `store.availability.acceptingOrders === false`.
- Variantes: `CLOSED_BY_SCHEDULE` (azulejo, mostra próximo horário),
  `MANUALLY_CLOSED` (pimenta, "Voltamos em breve"), `PAUSED`
  (pimenta, "Pedidos pausados"), `TENANT_SUSPENDED` (pimenta, mensagem
  genérica).
- Adicionar teste Playwright para cada estado via fixtures.
- A11y: `role="status"` + `aria-live="polite"`.

**Métricas**: tempo até o primeiro clique em "Ver cardápio" deve cair; taxa
de pedidos vazios (carrinho com loja fechada) deve cair.

### A4 — "Adicionar e continuar" no modal

**Hoje**: `handleAdd` em `product-modal.tsx` chama `onClose` logo após o
`addItem`.

**Plano**:

- Novo estado interno `lastAddedAt`. Após `addItem`, manter o modal aberto e
  renderizar uma faixa de sucesso "Adicionado ✓" no topo do modal com botão
  "Adicionar mais" (mantém modal) e "Ir para a sacola" (fecha + navega).
- Resetar `quantity` para 1 e manter `selectedOptions` se a personalização
  for a mesma (UX de combo).
- E2E: dois cliques em "Adicionar mais" mantêm o modal; clique em "Ir para a
  sacola" navega.

### A6 — Skeleton com shimmer

**Hoje**: `loading.tsx` do cardápio já possui blocos de skeleton, mas a animação
é apenas pulsação de opacidade. `ProductImage` mostra o ícone `ImageOff` durante
o carregamento.

**Implementação**:

- `src/app/[storeSlug]/loading.tsx`: mantém a estrutura atual; adiciona um
  overlay `::after` com gradiente animado (`storefront-skeleton-shimmer`) em
  todos os blocos do skeleton.
- `src/components/storefront/product-image.tsx`: durante `status === 'loading'`,
  renderiza `<span className="storefront-product-image-shimmer" />` com
  gradiente animado, respeitando `prefers-reduced-motion: reduce`.
- `src/app/globals.css`: centraliza os keyframes e garante que skeleton e shimmer
  sejam desabilitados quando o usuário optar por motion reduzida.

**Métricas**: melhor percepção de LCP; shimmer suaviza a transição até a imagem
real aparecer.

### A7 — Indicador de conexão

**Hoje**: não há feedback quando o dispositivo fica offline. Requisições de
catálogo/detalhe podem falhar silenciosamente.

**Implementação**:

- Novo `src/components/storefront/network-status.tsx` (client component).
- Escuta eventos `online`/`offline` e usa `navigator.onLine` como estado inicial.
- Renderiza banner sutil no topo do cardápio quando offline; ao reconectar,
  exibe "Conexão restabelecida" por 2s e desaparece automaticamente.
- Não bloqueia pedidos nem recarrega a página — apenas informa.

**Métricas**: evento `storefront_offline_shown` (a adicionar) + redução de
abandono em conexões instáveis.

### A10 — Cache público e deduplicação

**Hoje**: `getPublicStoreBySlug` já usa `cache` (React) + `unstable_cache`
(Next.js). `getPublicCatalog` usava apenas `unstable_cache`.

**Implementação**:

- `getPublicCatalog` agora também é envolvido por `cache` para deduplicar
  chamadas dentro do mesmo request RSC.
- As queries permanecem sem importar `next/headers` (`cookies`/`headers`),
  garantindo que a camada de cache público (`unstable_cache`) possa ser
  invalidada apenas por `revalidateTag` e sem sessão.
- Teste unitário verifica, no source de `src/server/queries/public-store.ts`,
  a ausência de imports de `next/headers` e a deduplicação do catálogo.

**Métricas**: `pnpm test` e `pnpm tsc` passando; cache hit em edges/
workers para leituras públicas.

### B1/B2 — ETA dinâmico e pedido em andamento

**Hoje**: o hero mostra a faixa estática da loja; o `quote` já calcula
`promisedFulfillmentMinAt/MaxAt`. O `useCustomerOrderTracking` existe mas não
alimenta o `/cart`.

**Plano**:

- No hero, trocar `estimatedTime` estático por "Pronto em 25-40 min" usando
  o cálculo do `getEffectiveEstimatedTime` quando a loja está aberta.
- No `/cart`, se `lastOrder` pertence ao mesmo `storeSlug` e está ativo,
  mostrar um `aside` com "Seu pedido #42 está em preparo — ver
  acompanhamento". Reaproveita o componente `CustomerOrderTracking` (fase 9)
  em modo compacto.

### C1 — JSON-LD

**Plano** (sem migrations):

- Novo arquivo `src/lib/storefront/jsonld.ts` com `buildMenuJsonLd(store,
  categories, url)`.
- Renderizado em `src/app/[storeSlug]/layout.tsx` via
  `<script type="application/ld+json" dangerouslySetInnerHTML={{__html: ...}} />`
  usando o `StorefrontSchemaOrg` type.
- Validar com `schema-dts` em dev e em CI (`schema-validator`).

### C2 — Sitemap

**Plano**:

- `src/app/sitemap.ts` (Next 16 nativo) retornando as URLs canônicas das
  lojas ativas com `lastmod = store.customization.publishedAt` (campo
  derivado do `StoreCustomization.publishedVersion`).
- Excluir `/cart`, `/checkout`, `/order/*` via `robots` por rota (C3).

### C5 — Service worker

**Plano**:

- Manual em `public/sw.js` registrado a partir de um `useEffect` em
  `src/app/layout.tsx` (somente após aceite, sem prompt intrusivo).
- Estratégias: cache-first para `api/store-assets` e
  `/api/store-assets/[id]`; stale-while-revalidate para o documento do
  cardápio; network-first para `/api/*` que envolve checkout.
- Versionamento por `BUILD_ID` da OpenNext para evitar cache fantasma.

### E1 — `next/image` com `IMAGES`

**Plano**:

- Adicionar loader custom em `src/lib/images/cloudflare-images.ts` que monta
  `https://imagedelivery.net/<account>/<assetId>/<variant>` lendo o
  `assetId` da `StoreAsset`.
- Migrar `product-image.tsx`, `storefront-hero.tsx`,
  `storefront-banner-image.tsx`, `category-nav.tsx` (capa e thumb).
- Manter `srcSet`/`sizes` para preservar responsividade.

### E2 — Code-split de `CatalogView`

**Plano**:

- Manter o server component `page.tsx` como está.
- Importar `CatalogView` via `next/dynamic` apenas no client wrapper, ou
  seguir o receituário de `docs/storefront-catalog-payload.md`: fixtures
  pequeno/médio/grande + benchmark antes de decidir.
- Se a economia de JS for < 10 KiB, não fragmentar.

---

## 5. Telemetria, observabilidade e qualidade

Eventos a adicionar para validar as hipóteses de UX:

- `storefront_view` (já implícito via page view)
- `storefront_search_submitted` com `queryLength`
- `storefront_search_no_results`
- `storefront_product_image_failed`
- `storefront_add_to_cart` (já existe em `recent_purchase_product_added` /
  `recommendation_added`; estender para `card_click`)
- `storefront_modal_open` e `storefront_modal_close` com `productId` e
  `durationMs`
- `storefront_share_used` (`web_share` | `clipboard` | `whatsapp`)
- `storefront_offline_shown`
- `storefront_pwa_installed`

Estes eventos alimentam o dashboard de operação do lojista e o
`pnpm perf:orders:queries` em produção.

Para qualidade:

- Adicionar `tests/e2e/storefront-polish.spec.ts` com 1 caso por item da
  Fase A.
- Adicionar snapshot tests por preset em `tests/unit/storefront-presets.test.tsx`
  (renderiza `<CatalogView>` com cada `visualPreset` + `layoutTemplate`).
- Atualizar `docs/phase-10-production-readiness.md` com o smoke manual
  estendido.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Crescimento do JS no cardápio ao adicionar features | Medir com `pnpm build` em cada PR; limite de 350 KiB gzip para o entrypoint. |
| Invalidação de cache ao mudar personalização | Reusar `revalidateTag` por loja; tag única `storefront:${slug}` no novo bundle (A10). |
| Service worker quebrar o `?coupon=` ou cookies Supabase | Restringir o SW a `GET` em rotas públicas; nunca interceptar `POST`. |
| PWA manifest com cores hard-coded | Derivar `theme_color` da `StoreCustomizationConfig.palette.primary`. |
| Migrações de produto (B3, B4) quebrarem tenants legados | Padrão expand → backfill → guard + preflight (ver Fase 8/9). |
| Mudanças de copy/IA quebrarem testes existentes | Manter `getByRole` / `getByLabelText` em E2E; evitar selectors por texto literal. |
| JSON-LD inválido | Validador `schema-dts` + teste unitário que monta e parseia o JSON. |
| Over-fetching de produto no modal | `useDeferredValue` em `productDetail` + cache de 60s já existente. Considerar SWR no E3. |

---

## 7. Sequência sugerida de execução

1. **A1, A4, A5, A7, A10** — cobrem o "uau" inicial sem risco.
2. **E1, E2** — performance e payload antes de adicionar mais features.
3. **C1, C2, C3** — SEO e descoberta (ganho composto).
4. **B1, B2, B6, B7** — sinais operacionais no cardápio/cart.
5. **C4, C5, C6, C7** — PWA e share rico.
6. **B3, B4, B5, D1-D5** — personalização e inteligência (com migrations).
7. **D6, D7, E3-E8** — longo prazo, mantendo qualidade.

Cada item produz:

- PR com diffs de UI + testes (Vitest + Playwright + axe).
- Entrada em `docs/storefront-ux-changelog.md` (novo, manter este roadmap
  como índice).
- Smoke manual quando aplicável (mesmo padrão de `phase-10-production-readiness.md`).
- Atualização desta página se houver mudança de fase ou de premissa.

---

## 8. Itens que **não** entram no roadmap (por enquanto)

- Login de cliente / área logada: o `customer-recognition` é anônimo e
  suficiente; LGPD pesa contra um login real para o consumidor final.
- Pagamento online: roadmap do `docs/roadmap.md` já cobre (Mercado Pago,
  Efí, Asaas).
- App nativo: o roadmap já lista PWA; manter como prioridade.
- Rastreamento de entrega: dependência externa, sem dependência interna
  aberta.
- Cálculo de frete por distância: separado do cardápio.
- Programa de fidelidade: pós-MVP por design.

Estes permanecem no roadmap macro, mas **não** são alvo desta revisão de
cardápio.

---

> Última atualização: este documento vive em `docs/storefront-ux-roadmap.md`.
> Cada fase concluída deve mover o item para `docs/storefront-ux-changelog.md`
> com a data, PR e métricas, mantendo este índice enxuto.
