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
