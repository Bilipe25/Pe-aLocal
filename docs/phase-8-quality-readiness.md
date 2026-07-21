# Fase 8 — qualidade, Cloudflare e rollback

Este checklist prepara staging sem executar deploy de produção e sem aplicar migrations remotas por
acidente. Ele complementa as instruções de `docs/testing.md`.

## Ordem recomendada de validação

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm test:e2e` com `E2E_ALLOW_MUTATIONS=false`
5. `pnpm test:e2e:a11y`
6. `pnpm cf:typegen`
7. `pnpm cf:build`
8. `pnpm test:workerd`

Use `E2E_ALLOW_MUTATIONS=true` somente em uma loja descartável de staging quando for validar compra,
publicação white-label, upload de imagem ou mudança de status.

## Smoke manual antes de staging

- Abrir uma loja pública em mobile e desktop.
- Adicionar produto com opcionais obrigatórios ao carrinho.
- Conferir busca, categorias, checkout e acompanhamento do pedido.
- Entrar como OWNER e abrir `/dashboard/orders`.
- Entrar como SUPER_ADMIN e abrir personalização da loja.
- Confirmar que OWNER, MANAGER e ATTENDANT não acessam `/admin`.
- Confirmar que alterações administrativas geram auditoria.

## Cloudflare

- Não coloque connection string diretamente em workflow ou `wrangler.jsonc`.
- Staging deve possuir `HYPERDRIVE`, `STORE_ASSETS_R2`, `IMAGES`, rate limiters, cache R2 e service
  binding conforme `wrangler.jsonc`.
- `pnpm cf:build` valida o pacote OpenNext localmente; `pnpm test:workerd` valida o preview Worker.
- Rollback de Worker deve ser decisão explícita: `pnpm exec wrangler rollback --env staging` apenas
  depois de escolher a versão anterior no dashboard/CLI.

## Banco e migrations recentes

As migrations recentes têm rollback manual nos próprios arquivos SQL. Antes de qualquer reversão:

1. Pause deploys.
2. Faça backup/export do banco.
3. Exporte tabelas que preservam histórico, principalmente `store_slug_redirects`,
   `store_schedule_exceptions`, auditorias e assets.
4. Reverta runtime e banco como decisões separadas.
5. Rode `pnpm db:validate`, `pnpm test` e smoke E2E depois da reversão.

Pontos sensíveis:

- `store_slug_redirects`: preserva links antigos. Exporte antes de remover.
- `store_schedule_exceptions`: contém feriados/exceções de funcionamento. Exporte antes de remover.
- `configurationVersion`: protege concorrência em settings. Não reduza versões manualmente sem
  restaurar snapshot consistente.
- `estimatedTimeMinMinutes` e `estimatedTimeMaxMinutes`: o campo textual `estimatedTime` continua
  existindo, mas a UI nova usa os campos estruturados.

## Critério de pronto

A Fase 8 é considerada pronta quando lint, typecheck, Vitest e build Cloudflare passam em ambiente
compatível, e quando os E2E mutáveis foram rodados em staging descartável ou conscientemente
adiados por falta de credenciais/ambiente seguro.
