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

## Exclusão e rollback

- A exclusão administrativa é lógica no banco.
- Assets referenciados pelo publicado, draft ou histórico não podem ser
  excluídos.
- A coleta definitiva revalida as referências antes de remover o objeto.
- Em rollback, mantenha os objetos no R2 e exporte `store_assets` antes de
  remover a tabela.
