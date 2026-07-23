# Testes e qualidade

## Objetivo

A Fase 8 consolida a pirâmide de qualidade do PedidoLocal: regras de negócio rápidas no Vitest,
contratos HTTP em integração, jornadas críticas no Playwright, auditoria de acessibilidade e smoke
no runtime Cloudflare/workerd. Deploy é uma etapa separada; esta suíte não publica produção.

## Comandos

```bash
pnpm test          # unitários e integração (Vitest)
pnpm test:watch    # Vitest em modo watch
pnpm test:e2e      # Playwright; inicia o Next.js localmente
pnpm test:e2e:a11y # auditoria WCAG nas rotas críticas
pnpm test:workerd  # smoke contra preview OpenNext/workerd
pnpm lint          # ESLint
pnpm typecheck     # TypeScript strict
pnpm cf:build      # build Cloudflare Workers via OpenNext
pnpm cf:dry-run:staging # empacotamento Wrangler sem publicar
pnpm perf:orders:load   # concorrência HTTP somente em localhost/staging
pnpm perf:orders:queries # EXPLAIN ANALYZE somente leitura em staging
```

Na primeira execução do Playwright, instale o navegador usado pelos projetos desktop e mobile:

```bash
pnpm exec playwright install chromium
```

## Organização

```text
tests/
├── unit/          # schemas, utilitários e services com dependências isoladas
├── integration/   # contratos entre Route Handlers, validação e respostas HTTP
├── e2e/           # jornadas em navegador e verificações de acessibilidade observável
└── setup.ts       # matchers compartilhados do Testing Library
```

## Matriz atual

| Camada      | Escopo atual                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| Unitários   | autenticação, tenants, sessão, permissões, disponibilidade, settings e schemas |
| Integração  | `/api/health`, login, logout, sessão atual e contratos de actions             |
| E2E público | home, login, cardápio, carrinho, checkout, acompanhamento e assets            |
| E2E admin   | SUPER_ADMIN, OWNER, personalização, painel operacional e status de pedidos    |
| A11y        | axe WCAG 2 A/AA em home, login, cardápio, admin e dashboard                   |
| Cloudflare  | `cf:build`, `cf:typegen` e smoke `test:workerd` contra preview OpenNext       |
| Navegadores | Chromium desktop e emulação mobile Pixel 5                                    |

## Regras para novos testes

- Toda nova regra de service deve cobrir sucesso, validação e erros de domínio.
- Route Handlers devem testar status HTTP e o formato seguro da resposta.
- Jornadas E2E devem usar seletores por papel, label, placeholder ou nome acessível.
- Testes que alteram banco precisam ficar protegidos por `E2E_ALLOW_MUTATIONS=true`.
- Use loja descartável para mutações E2E; nunca rode cenários mutáveis contra produção.
- Falhas E2E preservam screenshot e contexto em `test-results/`; esses artefatos não devem ser
  commitados.

## Variáveis E2E

A suíte usa o fluxo real do Supabase Auth e a autorização final do servidor. Ela não possui bypass
de teste.
Configure em `.env.local`, ou no ambiente do processo Playwright:

```text
E2E_SUPER_ADMIN_EMAIL=
E2E_SUPER_ADMIN_PASSWORD=
E2E_OWNER_EMAIL=
E2E_OWNER_PASSWORD=
E2E_TENANT_ID=
E2E_STORE_ID=
E2E_STORE_SLUG=
E2E_ORDER_TRACKING_TOKEN=
E2E_CATEGORY_NAME=
E2E_CATEGORY_IMAGE_PATH=
E2E_ALLOW_MUTATIONS=false
```

`E2E_ORDER_TRACKING_TOKEN` deve apontar para um pedido descartável e permite auditar a página de
acompanhamento sem criar um novo pedido. O fluxo completo de retirada exige simultaneamente OWNER,
slug da loja e `E2E_ALLOW_MUTATIONS=true`; ele cria e conclui um pedido real somente na loja de
teste.

## Carga e consultas

Os benchmarks possuem travas contra execução acidental. Fora de localhost, a carga HTTP exige
`ORDER_LOAD_ACKNOWLEDGE_STAGING=true`. O benchmark SQL exige
`ORDER_PERF_ACKNOWLEDGE_STAGING=true` e `ORDER_PERF_STORE_ID`; abre uma transação `READ ONLY`, usa
`statement_timeout` de 10 segundos e executa apenas `EXPLAIN ANALYZE` sobre consultas `SELECT`.

```bash
ORDER_LOAD_BASE_URL=https://staging.example.com \
ORDER_LOAD_COOKIE='cookie-de-sessao-descartavel' \
ORDER_LOAD_ACKNOWLEDGE_STAGING=true \
pnpm perf:orders:load

ORDER_PERF_STORE_ID=loja-descartavel \
ORDER_PERF_ACKNOWLEDGE_STAGING=true \
pnpm perf:orders:queries
```

Prepare volumes de 500 pedidos ativos e 10 mil históricos na base descartável antes da medição.
Não use seed de carga nem cookie de produção. Registre p50/p95/p99, throughput, tamanho de resposta,
índices escolhidos, buffers e quantidade real de linhas. A meta inicial é p95 abaixo de 1 segundo
para a página e abaixo de 750 ms para cada consulta; isso é um orçamento, não evidência até a
execução no ambiente alvo.

Sem essas variáveis, os cenários dependentes de autenticação, loja ou banco são ignorados com uma
justificativa explícita. As jornadas de publicação, upload, checkout real e mudança de status só
executam quando `E2E_ALLOW_MUTATIONS=true`.

## Cloudflare local

Para validar o pacote Worker localmente, o build precisa das variáveis públicas do Supabase e da
connection string local do Hyperdrive apontando para `DATABASE_URL`; não imprima secrets no terminal.
No Windows com PNPM, o OpenNext pode concluir o `next build` e falhar no empacotamento final por
permissão ao ler links de `node_modules` dentro de `.open-next`. Quando isso ocorrer, valide em CI,
Linux ou WSL antes de liberar staging.

O Playwright também pode concluir os testes e aguardar indefinidamente o encerramento do servidor
filho no Windows. Nesse caso, inicie `node node_modules/next/dist/bin/next dev` separadamente, aguarde
`/api/health` e execute o Playwright reutilizando o servidor. A CI Linux continua sendo o gate
definitivo de teardown e workerd.

```bash
pnpm cf:typegen
pnpm cf:build
pnpm test:workerd
```

A auditoria com axe bloqueia violações WCAG 2 A/AA de impacto `critical` ou
`serious` na home, login, cardápio e editor. Além do axe, os testes verificam overflow horizontal em
mobile e alvos tocáveis mínimos em áreas operacionais. As credenciais nunca devem ser versionadas,
impressas ou reutilizadas de produção.
