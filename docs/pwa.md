# PWA do PedidoLocal

O PedidoLocal oferece instalação global e por loja sem bibliotecas adicionais. A implementação usa Metadata Routes e Route Handlers do Next.js, um Service Worker estático e os assets estáticos publicados pelo OpenNext/Cloudflare.

## Manifests

- `/manifest.webmanifest` representa a plataforma PedidoLocal.
- `/{storeSlug}/manifest.webmanifest` representa a loja e usa somente nome, slug, descrição, `publishedConfig` e assets públicos ativos da mesma loja e tenant.
- O manifest de loja usa `id: /pwa/store/{storeId}` para manter a identidade após uma troca de slug.
- `start_url` e `scope` permanecem em `/{storeSlug}`. Domínios customizados não alteram o roteamento da aplicação para a raiz.
- Favicon ou logo white-label só é usado quando tem MIME PNG/JPEG/WebP/AVIF, ao menos 192 px e proporção entre 0,9 e 1,1. Caso contrário, são usados os ícones PedidoLocal.
- Drafts de personalização nunca são consultados.

O PNG oficial fornecido em 10/08/2026 é a fonte dos ícones versionados em `public/pwa/`. Os arquivos estáticos têm dimensões reais declaradas no manifest (180, 192 e 512 px). Para lojas com favicon ou logo elegível, o Cloudflare Images entrega variantes PNG exatas de 180, 192 e 512 px; a variante maskable preserva a arte dentro da área segura central.

O superadmin mostra uma prévia de instalação com nome, `start_url`, cor e fonte do ícone. Uploads novos de favicon exigem ao menos 192×192 px e proporção entre 0,9 e 1,1; 512×512 px é recomendado. Quando o favicon publicado não atende aos requisitos, um logo publicado elegível é usado. Sem fonte válida, o painel sinaliza o fallback PedidoLocal.

As associações de logo, favicon e imagens de categoria pertencem ao fluxo rascunho → publicação. Banners, domínios e entitlements são operações imediatas e auditadas; o painel identifica explicitamente esses dois ciclos.

## Política do Service Worker

O arquivo `/sw.js` controla a origem inteira e usa o cache `pedidolocal-shell-v3`. Alterações no conteúdo do shell exigem incremento explícito da versão.

| Requisição                                              | Estratégia                                 | CacheStorage    |
| ------------------------------------------------------- | ------------------------------------------ | --------------- |
| `/offline.html` e quatro ícones versionados             | Cache First após precache validado         | Sim             |
| Navegação pública `/` e `/{storeSlug}`                  | Network First com fallback `/offline.html` | Não guarda HTML |
| Carrinho, checkout, pedidos e acompanhamento            | Network Only                               | Não             |
| Dashboard, admin e autenticação                         | Network Only                               | Não             |
| `/api/**`, inclusive assets da loja                     | Network Only                               | Não             |
| Métodos diferentes de GET                               | Pass-through/Network Only                  | Não             |
| `_next/static`, fontes, scripts, imagens e cross-origin | Pass-through                               | Não             |

O precache usa `credentials: omit`, exige resposta `ok` e recusa respostas com `Cache-Control: private` ou `no-store`. Ativação exclui somente caches antigos iniciados por `pedidolocal-shell-`. Não são armazenados catálogo, preços, carrinho, cookies, tokens, pedidos, PII ou respostas autenticadas.

## Registro e atualização

- `next dev`: não registra o SW. Em localhost, remove apenas `/sw.js` e caches com o prefixo próprio para evitar interferência de execuções anteriores.
- Produção, staging e `next start`: registra `/sw.js` com escopo `/` e `updateViaCache: "none"`.
- A primeira instalação é silenciosa.
- Uma nova versão permanece `waiting`. Em rota segura, aparece o aviso “Uma nova versão está disponível”.
- Em carrinho, checkout, pedidos, dashboard, admin e autenticação, o aviso fica adiado.
- Ao confirmar, a página envia `SKIP_WAITING` e recarrega uma única vez após `controllerchange`.

Não há prompt de instalação, Background Sync, checkout offline nem catálogo em IndexedDB. O mesmo SW recebe Push do consumidor e do estabelecimento. Ele aceita somente rotas same-origin validadas de acompanhamento ou da Central, nunca altera pedidos e não muda a política de CacheStorage. Detalhes em [`web-push.md`](web-push.md).

## Rollout, rollback e diagnóstico

Service Workers sobrevivem a rollback do servidor. Para mudar arquivos precacheados:

1. incremente `CACHE_NAME` em `public/sw.js`;
2. publique o novo SW e os assets versionados na mesma entrega;
3. não reutilize o nome de um ícone cujo conteúdo mudou;
4. em rollback, publique um SW corretivo com uma versão nova — nunca dependa apenas da reversão do HTML;
5. não exclua caches sem o prefixo `pedidolocal-shell-`.

No DevTools, verifique Application → Service Workers e Cache Storage. O cache ativo deve conter somente `/offline.html` e os quatro ícones. O HTML de loja e todas as URLs sensíveis devem estar ausentes. O fallback é um asset autocontido de `public/`, sem React, App Router ou chunks do OpenNext.

## Validação

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm cf:build
pnpm test:e2e
pnpm test:e2e:a11y
pnpm test:workerd
```

O gate definitivo usa Linux e Node.js 22. O teste E2E de controle offline é executado em `next start` ou workerd, pois o registro é intencionalmente desativado em `next dev`.
