# Assets white-label no Cloudflare R2

Os arquivos das lojas usam o binding `STORE_ASSETS_R2`. Ele é separado do
`NEXT_INC_CACHE_R2_BUCKET`, reservado exclusivamente ao cache do OpenNext.

## Recursos por ambiente

| Ambiente   | Bucket                                |
| ---------- | ------------------------------------- |
| staging    | `pedidolocal-staging-store-assets`    |
| production | `pedidolocal-production-store-assets` |

O `wrangler.jsonc` apenas referencia esses nomes. Criar os buckets é uma etapa
de infraestrutura manual e deve ser aprovada separadamente. Nunca crie ou
modifique o bucket de produção durante o desenvolvimento local.

Depois de criar apenas o bucket autorizado, valide o binding com `wrangler dev`
ou com o ambiente de staging. O modo local do Wrangler fornece armazenamento R2
local sem precisar de credenciais no `.dev.vars`.

## Chaves e acesso

Os objetos seguem o formato:

```text
tenants/{tenantId}/stores/{storeId}/{assetType}/{assetId}.{extension}
```

O bucket não precisa ser público. A aplicação entrega os arquivos pela rota
`/api/store-assets/{assetId}`, que confirma o registro ativo no banco antes de
ler o objeto. Upload, substituição e exclusão exigem `SUPER_ADMIN` no servidor.

## Imagens de categoria

`CATEGORY_IMAGE` reutiliza o mesmo bucket e a mesma rota. O limite é 2 MB, com
dimensão mínima de 320×320, máxima de 8000×8000 e proporção entre 0,8 e 1,25.
PNG, JPEG, WebP e AVIF são aceitos; SVG não é permitido. O texto alternativo é
obrigatório, sem HTML e limitado a 300 caracteres.

A associação não fica em `Category`: ela pertence à configuração white-label
v2 em `categoryImages`. Upload cria somente o asset; salvar o draft e publicar
são etapas explícitas. A configuração pública nunca consulta `draftConfig`.

Configurações v1 são migradas em memória para v2 com imagens desativadas e lista
vazia. Revisões históricas não são reescritas. Ao restaurar uma revisão v1, o
novo draft é criado em v2.

## Exclusão e rollback

- A exclusão administrativa é lógica no banco.
- Assets referenciados pelo publicado, draft ou histórico não podem ser
  excluídos.
- A verificação cobre associações `categoryImages` em publicado, draft e todas
  as revisões, além dos campos de identidade e banners.
- A coleta definitiva revalida as referências antes de remover o objeto.
- Em rollback, mantenha os objetos no R2 e exporte `store_assets` antes de
  remover a tabela.
