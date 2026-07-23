# Migração para Cloudflare Workers

## Arquitetura adotada

```text
Next.js 16 (App Router)
  -> @opennextjs/cloudflare
  -> Cloudflare Worker / workerd
  -> Prisma 7 + @prisma/adapter-pg
  -> binding HYPERDRIVE
  -> Supabase PostgreSQL
```

Não existe backend separado. Server Components, Server Actions e Route Handlers continuam sendo a fronteira de servidor.

## Compatibilidade auditada

O projeto mantém `middleware.ts` em vez de `proxy.ts` temporariamente. No Next 16,
`proxy.ts` usa obrigatoriamente o runtime Node.js, e o OpenNext 1.x ainda não oferece
suporte a Node Middleware. Remova esta exceção e execute o codemod para `proxy.ts`
quando o adaptador declarar suporte ao runtime Node nessa camada.

| Dependência/padrão              |    Compatível | `nodejs_compat` |                     Refatoração |                                           Removido |
| ------------------------------- | ------------: | --------------: | ------------------------------: | -------------------------------------------------: |
| Next.js 16 + OpenNext 1.20.1    |           sim |             sim |                    configuração |                                                não |
| Prisma 7 + `@prisma/adapter-pg` |           sim |             sim |          cliente por requisição |                                                não |
| `pg` 8.22.x                     |           sim |             sim | connection string do Hyperdrive |                                                não |
| Argon2                          |           não |               — |                   Supabase Auth |                                                sim |
| sessão/cookie próprios          |           não |               — |            cookies SSR Supabase | código removido; tabela preservada temporariamente |
| Pusher server/client            |   condicional | sim no servidor |      validar eventos no preview |                                                não |
| `Buffer` em storage             |       evitado |               — |                    `Uint8Array` |                                                sim |
| `node:crypto` para sessão       | desnecessário |               — |        Supabase Auth/Web Crypto |                                                sim |
| singleton global Prisma/Pool    |           não |               — |        `getDb()` request-scoped |                                                sim |
| rate limiter em memória         |           não |               — |          bindings Rate Limiting |                                                sim |

## Arquivos de runtime

- `wrangler.jsonc`: Worker, assets, Images, R2, Hyperdrive, rate limiting, observabilidade e ambientes.
- `open-next.config.ts`: cache incremental em R2.
- `cloudflare-env.d.ts`: gerado por `wrangler types`; não editar manualmente.
- `.dev.vars.example`: variáveis locais do preview sem valores reais.
- `middleware.ts`: refresh Supabase e redirects leves; não acessa Prisma.

## Preparar staging

1. Crie os buckets `pedidolocal-staging-opennext-cache` e `pedidolocal-production-opennext-cache`.
2. No dashboard Cloudflare, crie primeiro a configuração Hyperdrive de staging apontando para a conexão PostgreSQL direta do Supabase com TLS obrigatório.
3. Substitua somente o ID `00000000000000000000000000000000` do ambiente correspondente no `wrangler.jsonc`.
4. Prefira um usuário PostgreSQL dedicado. Como as tabelas usam RLS deny-by-default para a Data API, documente explicitamente se o usuário do Prisma é proprietário das tabelas ou possui `BYPASSRLS`; não conceda acesso a schemas fora do necessário.
5. Crie os secrets com o prompt seguro do Wrangler: `SUPABASE_SECRET_KEY`, chaves Pusher e outros valores privados. O Worker companion de eventos possui secrets próprios; consulte `docs/order-realtime-rollout.md`. Nunca use `NEXT_PUBLIC_` em secrets.
6. Configure como build variables as duas variáveis públicas do Supabase, pois o Next.js precisa delas durante o build.
7. Gere novamente os tipos: `pnpm cf:typegen`.

Não coloque connection strings em `wrangler.jsonc`, comandos versionados, logs ou artefatos CI. Para preview local, copie `.dev.vars.example` para `.dev.vars` e use `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.

## Comandos

```text
pnpm dev          Next.js em Node, ciclo rápido
pnpm cf:typegen   regenera os tipos de bindings
pnpm cf:build     gera .open-next
pnpm preview      executa via workerd
pnpm test:workerd smoke E2E contra o preview
pnpm upload       envia uma versão sem promover
pnpm deploy       build e deploy explícito
```

Migrations, seed e Studio rodam fora do Worker e usam `DIRECT_URL`. O runtime nunca deve receber `DIRECT_URL`.
O workflow manual aplica migrations antes dos Workers e exige `DIRECT_URL` no environment protegido do GitHub; essa variável não é enviada ao runtime.

## Cache e consistência

- Assets com hash usam cache imutável.
- O cache incremental do OpenNext usa R2.
- Respostas autenticadas e fluxos Auth usam `private, no-store`; o SDK SSR também propaga os headers de refresh no middleware.
- O cardápio público pode usar tags Next por loja. Pedidos, pagamentos, dashboard e dados do usuário nunca recebem cache público.
- Hyperdrive pode armazenar resultados de leitura; fluxos que exigem read-after-write devem usar configuração sem query cache ou consulta compatível com consistência, validada em staging.

## Observabilidade

Logs e traces estão ativos. Registre somente IDs técnicos, duração, ambiente e código do erro. Nunca registre senha, JWT, refresh token, cookies, secret keys, connection strings ou payload completo de pagamento.

## Rollback

1. Interrompa promoção de produção.
2. Use `wrangler versions list --env <ambiente>` e revise a versão anterior.
3. Execute `wrangler rollback --env <ambiente>` somente após autorização.
4. Se o problema for Hyperdrive, restaure o ID anterior no config e faça staging primeiro.
5. As tabelas `sessions` e a coluna `passwordHash` permanecem durante a janela de validação, mas nenhum cookie legado concede acesso. Reativar a autenticação antiga exige uma decisão de segurança explícita e reversão de código, nunca apenas restaurar o cookie.
