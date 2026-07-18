# Validação operacional do white-label

## Escopo

Este roteiro valida personalização, assets, banners, domínios manuais e
entitlements sem criar recursos Cloudflare, aplicar migrations remotas ou fazer
deploy. O cardápio público continua lendo somente `publishedConfig`.

## Ordem segura em staging

1. Faça backup lógico das tabelas afetadas e registre a versão atual do Worker.
2. Confirme que o bucket `pedidolocal-staging-store-assets` e os bindings
   `STORE_ASSETS_R2` e `IMAGES` já existem no ambiente de staging.
3. Revise `DIRECT_URL` localmente e execute `pnpm db:deploy` somente após
   autorização específica para alterar o banco de staging.
4. Execute `pnpm db:seed` somente em staging/seed e com credenciais próprias; o
   seed recusa produção e não cria membership para o `SUPER_ADMIN`.
5. Execute os gates locais e o dry-run descritos abaixo.
6. Em uma loja descartável, valide draft, prévia, publicação, histórico,
   restauração, asset, imagem de categoria, banner e canonical manual.
7. Promova para staging somente após revisão do diff e dos logs de auditoria.

## Gates

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm cf:build
pnpm exec wrangler deploy --dry-run --env staging
pnpm test:workerd
```

O E2E de imagens de categoria requer também `E2E_CATEGORY_NAME` e
`E2E_CATEGORY_IMAGE_PATH`, apontando para uma imagem válida de pelo menos
320×320. Ele só executa mutações quando `E2E_ALLOW_MUTATIONS=true` e deve usar
uma loja descartável.

O último teste depende de preview workerd funcional, navegador Chromium e
variáveis de teste. `wrangler deploy --dry-run` não publica o Worker.

## Bundle

- Linha de base do deploy de staging antes do white-label: **3453,71 KiB
  comprimidos**, conforme o log do GitHub Actions fornecido.
- O build Next.js desta fase passou, mas o OpenNext 1.20.1 não concluiu no
  Windows: o esbuild recebeu `Access denied` nos junctions de `react`,
  `react-dom` e `styled-jsx`. Sem `handler.mjs`, o dry-run termina antes da
  compressão e **não produz um tamanho posterior comparável**.
- O inventário parcial atual confirma como maiores arquivos o Prisma query
  compiler em base64 (4788,75 KiB), `capsize-font-metrics.json` do Next
  (4200,80 KiB), runtime Edge (781,99 KiB) e runtimes App Router/React. Esses
  tamanhos brutos não equivalem ao upload gzip do Wrangler.
- A medição posterior deve ser repetida no CI Linux/Ubuntu com
  `pnpm cf:build` e `pnpm exec wrangler deploy --dry-run --env staging`. Só esse
  resultado pode ser comparado aos **3453,71 KiB** da linha de base.
- Investigue separadamente código do Worker e assets estáticos; JavaScript do
  editor administrativo não deve ser importado pelo cardápio público. Os
  manifests do Next gerados nesta fase mantêm
  `customization-editor.tsx` apenas na rota administrativa.

### Maiores módulos da linha de base

| Módulo                                 | Tamanho bruto |
| -------------------------------------- | ------------: |
| `server-functions/default/handler.mjs` |  10304,34 KiB |
| Prisma `query_compiler_fast_bg.wasm`   |   3591,53 KiB |
| `middleware/handler.mjs`               |    683,32 KiB |
| `cloudflare/images.js`                 |     20,50 KiB |
| `middleware/open-next.config.mjs`      |     13,20 KiB |

O query compiler entra porque o Prisma Client 7 usa o compilador WASM no
runtime. O middleware é um entrypoint separado do OpenNext para atualização da
sessão Supabase e redirects leves; não importa Prisma. A suíte axe é dependência
de desenvolvimento e não aparece no build da aplicação.

## Rollback

1. Interrompa qualquer promoção e preserve logs, IDs e snapshots de auditoria.
2. Reverta primeiro o código para a versão anterior validada.
3. Reative `showPedidoLocalBranding`, desative banners e remova domínios
   primários antes de retirar suporte às novas tabelas.
4. Para imagens de categoria, desligue `showCategoryImages` antes de reverter a
   renderização; preserve as associações e os objetos R2.
5. Exporte customizações, revisões, assets, banners, domínios e entitlements.
6. Preserve objetos R2 referenciados por histórico; não apague o bucket.
7. Execute manualmente os blocos de rollback documentados nas migrations apenas
   após confirmar que a versão antiga não lê mais essas tabelas/colunas.
8. Não remova valores antigos de enums de auditoria enquanto houver logs que os
   referenciem.

Rollback de Worker, banco e recursos Cloudflare são decisões independentes. Não
use `prisma migrate reset`, `prisma db push` ou exclusão de recursos como atalho.
