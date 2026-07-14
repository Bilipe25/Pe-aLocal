# PedidoLocal

SaaS de lojas virtuais próprias para pequenas lanchonetes, pizzarias, hamburguerias, açaíterias e negócios locais de alimentação.

Cada estabelecimento tem sua própria página pública, cardápio, pedidos e painel administrativo.

## Stack

- **Framework**: Next.js 15 (App Router, Server Components, Server Actions)
- **Linguagem**: TypeScript (strict)
- **Estilo**: Tailwind CSS v4 + shadcn/ui
- **Banco**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Autenticação**: Sessões em banco com cookies httpOnly
- **Validação**: Zod
- **Formulários**: React Hook Form
- **Estado remoto**: TanStack Query
- **Estado local**: Zustand
- **Ícones**: Lucide React
- **Testes**: Vitest + React Testing Library + Playwright

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL (ou Supabase)

## Instalação

```bash
# Clonar o repositório
git clone <url> pedidolocal
cd pedidolocal

# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
cp .env.example .env.local
# Edite .env.local com suas credenciais

# Gerar Prisma Client
pnpm db:generate

# Executar migrations
pnpm db:migrate

# Popular banco com dados de demonstração
pnpm db:seed
```

## Variáveis de Ambiente

Veja `.env.example` para todas as variáveis necessárias.

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL (com pooling) |
| `DIRECT_URL` | URL de conexão direta (para migrations) |
| `AUTH_SECRET` | Segredo para cookies de sessão (min 32 chars) |
| `APP_URL` | URL base da aplicação |
| `SUPER_ADMIN_EMAIL` | E-mail do super admin |

## Scripts

```bash
pnpm dev           # Servidor de desenvolvimento
pnpm build         # Build de produção
pnpm start         # Iniciar produção
pnpm lint          # Verificar lint
pnpm typecheck     # Verificar tipos
pnpm test          # Testes unitários
pnpm test:watch    # Testes em modo watch
pnpm test:e2e      # Testes end-to-end
pnpm db:migrate    # Executar migrations
pnpm db:deploy     # Deploy migrations (produção)
pnpm db:seed       # Popular banco
pnpm db:studio     # Abrir Prisma Studio
pnpm format        # Formatar código
```

## Credenciais de Desenvolvimento

Após executar o seed:

| Perfil | E-mail | Senha |
|---|---|---|
| Super Admin | admin@pedidolocal.com.br | (definido no seed) |
| Proprietário | dono@demo.com | SenhaDemo123! |

> ⚠️ **Nunca use estas credenciais em produção.**

## Estrutura do Projeto

```
src/
├── app/           → Rotas e páginas (App Router)
├── components/    → Componentes React (ui, shared, storefront, dashboard)
├── features/      → Módulos por domínio de negócio
├── server/        → Lógica de servidor (auth, database, services, etc.)
├── lib/           → Utilitários compartilhados
├── hooks/         → React hooks customizados
├── stores/        → Zustand stores
├── schemas/       → Zod schemas compartilhados
├── types/         → Tipos TypeScript globais
└── config/        → Configuração centralizada
```

## Arquitetura

Monólito modular full-stack com Next.js. Veja `docs/architecture.md` para detalhes.

## Multi-tenancy

Cada estabelecimento é um tenant isolado. Dados nunca vazam entre tenants. Veja `docs/multi-tenancy.md`.

## Fases de Implementação

| Fase | Descrição | Status |
|---|---|---|
| 1 | Fundação | ✅ Concluída |
| 2 | Autenticação e Tenants | 🔲 Pendente |
| 3 | Loja e Catálogo | 🔲 Pendente |
| 4 | Loja Pública | 🔲 Pendente |
| 5 | Checkout e Pedidos | 🔲 Pendente |
| 6 | Painel Operacional | 🔲 Pendente |
| 7 | Qualidade e Deploy | 🔲 Pendente |

## Limitações do MVP

- Sem pagamentos online (PIX manual via WhatsApp)
- Sem WebSockets (polling de 10s no painel)
- Sem Redis (rate limiting in-memory)
- Sem app mobile nativo (PWA-friendly)
- Sem rastreamento de entrega
- Sem cálculo de frete por distância

## Roadmap

Veja `docs/roadmap.md`.

## Licença

Proprietário — Todos os direitos reservados.
