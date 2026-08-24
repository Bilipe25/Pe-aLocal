# Hyperdrive: leituras frescas e cacheadas

O runtime considera `HYPERDRIVE_FRESH` a conexão canônica para autenticação, permissões,
configurações, pedidos, pagamentos, salão e qualquer leitura imediatamente posterior a uma
mutação. `HYPERDRIVE` permanece reservado para leituras públicas que toleram staleness e só deve
ser acessado explicitamente por `getCachedDb()`.

Enquanto o binding `HYPERDRIVE_FRESH` não existir, `getDb()` usa `HYPERDRIVE` como fallback para
permitir rollout aditivo. Produção não deve permanecer nesse estado: o deploy deve ser promovido
somente depois que o binding fresh estiver presente em staging e production.

## Recursos provisionados

| Ambiente   | Nome                           | ID                                 | Query cache  |
| ---------- | ------------------------------ | ---------------------------------- | ------------ |
| staging    | `pedidolocal-staging-fresh`    | `8efb30a2a2eb4a9b87fa25e0509c4709` | desabilitado |
| production | `pedidolocal-production-fresh` | `5073a982b5594aa88a80a87f7cbf9520` | desabilitado |

Provisionados em 2026-08-24 contra o endpoint direto do Supabase
`db.wxkvajjupvvfwyfgxacb.supabase.co:5432/postgres`. A Cloudflare recomenda não apontar
Hyperdrive para os endpoints de pool do Supabase, pois o próprio Hyperdrive já mantém o pool.

## Provisionamento autorizado

Crie uma segunda configuração apontando para o mesmo PostgreSQL direto (não para o pooler do
Supabase) com query caching desabilitado:

```bash
pnpm exec wrangler hyperdrive create pedidolocal-staging-fresh \
  --connection-string="<DATABASE_URL>" \
  --caching-disabled

pnpm exec wrangler hyperdrive create pedidolocal-production-fresh \
  --connection-string="<DATABASE_URL>" \
  --caching-disabled
```

Depois, adicione os IDs como binding `HYPERDRIVE_FRESH` em `wrangler.jsonc` e
`wrangler.order-events.jsonc`, execute `pnpm cf:typegen` e os dry-runs dos dois ambientes.

Não reutilize o mesmo ID de `HYPERDRIVE` sob outro nome: isso não altera a política de cache.

## Verificação

1. `wrangler hyperdrive get <ID>` deve informar caching desabilitado.
2. Uma mutação seguida de leitura por outra request deve devolver a nova versão imediatamente.
3. Auth, permission checks, settings, Orders, KDS, Dining e Payments devem continuar usando
   `getDb()`.
4. Somente queries públicas documentadas podem migrar para `getCachedDb()`.
