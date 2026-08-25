---
version: 1
slug: 'src-app-storeslug-mais-page-tsx'
primary_target: 'src/app/[storeSlug]/mais/page.tsx'
related_targets:
  [
    'src/components/storefront/storefront-more.tsx',
    'src/components/storefront/storefront-bottom-nav.tsx',
    'src/components/storefront/store-info-sheet.tsx',
    'src/components/storefront/storefront-share-button.tsx',
    'src/app/[storeSlug]/favorites/page.tsx',
    'src/app/[storeSlug]/page.tsx',
    'src/app/globals.css',
  ]
---

Surface: `/[storeSlug]/mais` — hub público e mobile-first de relacionamento, benefícios, dados e
informações da loja. Visitor mode: Operate.

Thesis: quatro destinos permanentes contam a jornada inteira — Cardápio compra, Carrinho conclui,
Pedidos acompanha e Mais reúne relacionamento, benefícios, dados autorizados e informações da
loja. O hub recusa a forma de uma área de conta, gaveta técnica ou quinta navegação primária.

Navigation: a bottom nav tem exatamente quatro colunas iguais: Cardápio, Carrinho, Pedidos e Mais.
Mais fica ativo em `/mais`, `/mais/*`, `/favorites`, `/favorites/*`, `/account` e `/account/*`;
Pedidos cobre somente `/orders` e `/order/*`. O badge store-scoped do Carrinho e o indicador de
histórico em Pedidos permanecem; Mais não recebe badge. Em cada destino ativo, texto, ícone e
superfície usam a mesma linguagem white-label e `aria-current="page"`.

Composition: header compacto com Home, `Mais`, subtítulo limitado a duas linhas e logo real ou
fallback da Store. `Para você` agrupa Favoritos, Ofertas e cupons e Fidelidade; `A loja` agrupa
Sobre a loja e Compartilhar loja; `Seus dados` aparece somente no estado Verified. Cada domínio usa
um container linear com ícones circulares, divisores internos e chevron apenas quando a linha
navega. O callout factual encerra o conteúdo antes da bottom nav fixa.

Guest and Verified:

- Guest e Recognized sem ConsumerSession acessam Mais sem OTP, veem `Para você`, `A loja` e o
  callout, e não recebem card vazio, `Seus dados`, endereços, e-mail, identificador ou status
  técnico.
- Verified significa ConsumerSession validada no servidor e autorizada para a Store atual. Vê o
  mesmo conteúdo público mais `Seus dados → Meus endereços`, que navega para
  `/[storeSlug]/account/addresses`. O Client Component recebe apenas o booleano de autorização,
  nunca PII.
- Favoritos continua local para Guest e usa a sincronização existente quando autorizada; a
  contagem é store-scoped, omite zero e limita a apresentação a `99+`.

Behavior and data: a rota é Server Component dinâmico, público e `noindex`/`nofollow`. Ofertas usa
somente a consulta pública ativa para a Store e seu timezone; havendo resultados, mostra contagem e
leva a `#ofertas`, sem criar página ou carregar o catálogo em `/mais`. Fidelidade é um `div`
`aria-disabled="true"`, visualmente atenuado, sem chevron, rota ou backend. Sobre a loja reutiliza o
mesmo `StoreInfoSheet` via trigger injetado; Compartilhar reutiliza `StorefrontShareButton` com a
URL canônica da vitrine.

White-label: a referência visual governa composição, hierarquia e densidade, nunca a paleta. Hub,
bottom nav e StoreInfo consomem tokens `--store-*`, `--font-*` e `color-mix()`; fontes, cor ativa,
fundos, bordas, foco e raios acompanham a identidade publicada. O portal Radix é montado dentro de
`.storefront-theme`, preservando esses tokens no sheet. Não existe imagem decorativa; somente o logo
real/fallback e ícones Lucide funcionais.

Responsive and access:

- Base mobile: container central de até 38rem, gutter de 1rem, safe areas superior/laterais/
  inferior preservadas, linhas de 4.6rem e bottom nav fixa com itens de pelo menos 3.5rem. A página
  usa scroll normal; apenas o sheet possui scroll interno contido.
- Até 374px: gutter cai para 0.75rem e header, logo, ícones e linhas comprimem sem reduzir texto
  essencial abaixo de 0.875rem nem alvo acionável abaixo de 44px.
- Abaixo de 640px: `StoreInfoSheet` mantém `store-info-details` em uma única coluna. A partir de
  640px, os detalhes passam a duas colunas quando houver largura.
- Até 767px: o CTA `Sobre a loja` do hero fica oculto porque o destino vive em Mais. A partir de
  768px, a bottom nav desaparece, o CTA do hero volta e o StoreInfo muda de bottom sheet para drawer
  lateral; a rota Mais continua centralizada e compacta se acessada diretamente.
- Links, botões, `aria-label`, `aria-current`, `aria-disabled`, ícones decorativos e foco visível
  preservam semântica; movimento respeita `prefers-reduced-motion`.

Visual evidence: as capturas da implementação atual em `.impeccable/review/` registram o estado
Guest nos viewports móveis (`mobile.png`, `mobile-360x800.png`, `mobile-375x812.png`,
`mobile-393x852.png`, `mobile-430x932.png`), a transição sem bottom nav em tablet/desktop
(`tablet-768x1024.png`, `desktop.png`) e o sheet móvel reutilizado
(`store-info-sheet-mobile.png`). A matriz Guest/Verified e a coluna única abaixo de 640px são
garantidas pelo código e pelo breakpoint, não inferidas de uma captura com dados privados.

Restrictions: sem fidelidade real, pontos, cashback, engine de benefícios, nova autenticação,
schema, migration, dependência, paleta hardcoded da referência, asset externo, quinta tab, badge em
Mais, nova query de catálogo, cache público de estado Verified, exposição de PII ou duplicação de
StoreInfo/share. Nenhum comportamento V2 é antecipado por este hub.
