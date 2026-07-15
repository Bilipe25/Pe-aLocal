# Baseline da migração Cloudflare

Data: 2026-07-15  
Branch: `codex/chore-cloudflare-workers-migration`

## Estado inicial

- Next.js 16.2.10, React 19.2.4 e TypeScript strict.
- Prisma 7.8.0 com `@prisma/adapter-pg` e `pg` 8.22.x sobre PostgreSQL/Supabase.
- Autenticação legada com Argon2, tabela `sessions`, cookie `pedidolocal_session` e tokens próprios.
- App Router com Server Components, Server Actions e Route Handlers.
- Pusher, TanStack Query, Zustand, Vitest e Playwright.
- 107 arquivos em `src`, `prisma`, `tests` e `docs`; 25 rotas no build inicial.

## Comandos e resultados

| Comando                          | Resultado | Duração aproximada | Observações                                                                          |
| -------------------------------- | --------: | -----------------: | ------------------------------------------------------------------------------------ |
| `node --version`                 |         0 |                2 s | Node v24.14.0                                                                        |
| `corepack pnpm --version`        |         0 |               34 s | pnpm 11.13.0; exigiu acesso ao registro na primeira execução                         |
| `pnpm install --frozen-lockfile` |         0 |                5 s | lockfile íntegro e dependências atualizadas                                          |
| `pnpm lint`                      |         0 |              132 s | sem erros                                                                            |
| `pnpm typecheck`                 |         0 |               77 s | sem erros                                                                            |
| `pnpm test`                      |         0 |              135 s | 9 arquivos, 80 testes aprovados                                                      |
| `pnpm build`                     |         0 |              114 s | primeira tentativa falhou sem rede ao baixar Google Fonts; repetição com rede passou |
| `pnpm db:validate`               |         0 |               13 s | schema Prisma válido                                                                 |
| `pnpm audit --prod`              |         1 |               20 s | 2 vulnerabilidades moderadas transitivas                                             |
| `pnpm outdated`                  |         1 |               58 s | listou atualizações disponíveis; saída 1 é esperada quando há pacotes desatualizados |
| `pnpm test:e2e`                  |         1 |               23 s | o `webServer` chama `pnpm`, ausente no PATH desta máquina; nenhum teste E2E iniciou  |

## Vulnerabilidades iniciais

- `@hono/node-server <1.19.13`, transitivo de `@prisma/dev` (`GHSA-92pp-h63x-v22m`).
- `postcss <8.5.10`, transitivo de Next.js (`GHSA-qx2v-qp2m-jg93`).

São achados da baseline, não introduzidos pela migração. Atualizações diretas de Prisma/Next devem ser avaliadas separadamente para evitar mudança funcional não relacionada.

## Riscos principais

1. O singleton global de Prisma/Pool é incompatível com o isolamento de requisições do Workers.
2. A autenticação valida apenas a presença do cookie no middleware e usa hash nativo Argon2.
3. Usuário sem membership recebe `OWNER` implicitamente em `validateCurrentSession()`.
4. `requireStoreAccess()` não rejeita lojas de outro tenant.
5. O rate limiter em memória não é consistente entre isolates.
6. IDs de tenant enviados ao cliente nunca podem se tornar fonte de verdade de autorização.
7. O build depende de rede para baixar Google Fonts; considerar fontes locais em uma etapa posterior.

## Rotas críticas

- Público: `/[storeSlug]`, carrinho, checkout e acompanhamento de pedido.
- Auth: `/login`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`.
- Administrativo: `/dashboard`, catálogo, pedidos, entrega e configurações da loja.

## Limitações ambientais

- Não foi feito deploy nem alteração em recursos Cloudflare/Supabase.
- Não foi executada migration remota nem consulta a dados de produção.
- O teste em `workerd` será registrado após a configuração OpenNext e dos bindings locais.
