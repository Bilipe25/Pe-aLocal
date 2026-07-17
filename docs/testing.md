# Testes e qualidade

## Objetivo

A Fase 7 usa uma pirâmide de testes: regras de negócio rápidas no Vitest, contratos HTTP em
integração e jornadas críticas no Playwright. O deploy na Vercel é uma etapa separada e não é
necessário para executar esta suíte localmente.

## Comandos

```bash
pnpm test          # unitários e integração (Vitest)
pnpm test:watch    # Vitest em modo watch
pnpm test:e2e      # Playwright; inicia o Next.js localmente
pnpm lint          # ESLint
pnpm typecheck     # TypeScript strict
pnpm build         # build de produção local
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

| Camada      | Escopo atual                                                                   |
| ----------- | ------------------------------------------------------------------------------ |
| Unitários   | autenticação, tenants, sessão, senha, permissões, erros, schemas e utilitários |
| Integração  | `/api/health`, login, logout e sessão atual                                    |
| E2E         | home, navegação para login, validação acessível do formulário e health check   |
| Navegadores | Chromium desktop e emulação mobile Pixel 5                                     |

## Regras para novos testes

- Toda nova regra de service deve cobrir sucesso, validação e erros de domínio.
- Route Handlers devem testar status HTTP e o formato seguro da resposta.
- Jornadas E2E devem usar seletores por papel, label ou nome acessível.
- Testes que alteram o banco devem criar dados próprios e limpar somente esses dados.
- Falhas E2E preservam screenshot e contexto em `test-results/`; esses artefatos não devem ser
  commitados.

## Próximas coberturas

1. Compra completa: catálogo, adicionais, carrinho, checkout e consulta do pedido.
2. Painel autenticado: login, filtro, atualização de status e confirmação de pagamento.
3. Auditoria WCAG automatizada nas rotas críticas.
4. Orçamento de performance baseado em Core Web Vitals no build de produção.

## White-label e acessibilidade

A suíte `tests/e2e/white-label.spec.ts` usa o fluxo real do Supabase Auth e a
autorização final de `public.users.platformRole`. Ela não possui bypass de teste.
Configure em `.env.local`, ou no ambiente do processo Playwright:

```text
E2E_SUPER_ADMIN_EMAIL=
E2E_SUPER_ADMIN_PASSWORD=
E2E_OWNER_EMAIL=
E2E_OWNER_PASSWORD=
E2E_TENANT_ID=
E2E_STORE_ID=
E2E_STORE_SLUG=
E2E_ALLOW_MUTATIONS=false
```

Sem essas variáveis, os cenários dependentes de autenticação ou banco são
marcados como ignorados com uma justificativa explícita. A jornada de publicação
só executa quando `E2E_ALLOW_MUTATIONS=true`; use essa opção exclusivamente em
uma loja descartável de teste. A própria jornada volta ao layout publicado
original e descarta o draft criado pela validação de restauração.

```bash
pnpm test:e2e
pnpm test:e2e:a11y
pnpm test:workerd
```

A auditoria com axe bloqueia violações WCAG 2 A/AA de impacto `critical` ou
`serious` na home, login, cardápio e editor. As credenciais nunca devem ser
versionadas, impressas ou reutilizadas de produção.
