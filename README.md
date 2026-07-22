# PedidoLocal

SaaS de lojas virtuais próprias para pequenas lanchonetes, pizzarias, hamburguerias, açaíterias e negócios locais de alimentação.

Cada estabelecimento tem sua própria página pública, cardápio, pedidos e painel administrativo.

## Stack

- **Framework**: Next.js 16 (App Router, Server Components, Server Actions)
- **Linguagem**: TypeScript (strict)
- **Estilo**: Tailwind CSS v4 + shadcn/ui
- **Banco**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Autenticação**: Supabase Auth com cookies SSR
- **Runtime**: Cloudflare Workers via OpenNext e Hyperdrive
- **Validação**: Zod
- **Formulários**: React Hook Form
- **Estado remoto**: TanStack Query
- **Estado local**: Zustand
- **Ícones**: Lucide React
- **Testes**: Vitest + React Testing Library + Playwright

## Pré-requisitos

- Node.js 20+
- pnpm 11+
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

| Variável                                        | Descrição                               |
| ----------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`                                  | URL de conexão PostgreSQL (com pooling) |
| `DIRECT_URL`                                    | URL de conexão direta (para migrations) |
| `APP_URL`                                       | URL base da aplicação                   |
| `SEED_SUPER_ADMIN_EMAIL`                        | Identidade criada pelo seed local       |
| `NEXT_PUBLIC_SUPABASE_URL`                      | URL da API do projeto Supabase          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`          | Chave publicável da API Supabase        |
| `SUPABASE_SECRET_KEY`                           | Chave secreta, somente no servidor      |
| `PUSHER_APP_ID`                                 | ID da aplicação Pusher (servidor)       |
| `PUSHER_KEY` / `NEXT_PUBLIC_PUSHER_KEY`         | Chaves Pusher do servidor e cliente     |
| `PUSHER_SECRET`                                 | Segredo Pusher (somente servidor)       |
| `PUSHER_CLUSTER` / `NEXT_PUBLIC_PUSHER_CLUSTER` | Cluster Pusher do servidor e cliente    |
| `PUSHER_LEGACY_PUBLIC_CHANNELS`                 | Compatibilidade temporária de rollout; veja `docs/order-realtime-rollout.md` |

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

| Perfil       | E-mail                   | Senha                  |
| ------------ | ------------------------ | ---------------------- |
| Super Admin  | `SEED_SUPER_ADMIN_EMAIL` | (definida no ambiente) |
| Proprietário | dono@demo.com            | SenhaDemo123!          |

> ⚠️ **Nunca use estas credenciais em produção.**

## 🎨 Identidade Visual (Design System)

O PedidoLocal possui um design system próprio com cores semânticas inspiradas em ingredientes e materiais de cozinha, e uma tipografia pensada para clareza e personalidade.

### Cores

| Nome        | Hex       | Uso                                                    |
| ----------- | --------- | ------------------------------------------------------ |
| **Papel**   | `#FFFDF9` | Fundo principal da aplicação                           |
| **Tinta**   | `#241C15` | Cor principal para textos e títulos                    |
| **Pimenta** | `#D9480F` | Cor primária — botões, CTAs, links de ação             |
| **Erva**    | `#3F7D58` | Estados positivos — disponível, confirmado, sucesso    |
| **Azulejo** | `#3B6E8F` | Informação secundária, links de apoio, alertas neutros |
| **Kraft**   | `#EFE0C3` | Superfícies de destaque — cards especiais, comandas    |

### Fontes

| Família                 | Classe Tailwind           | Uso                               |
| ----------------------- | ------------------------- | --------------------------------- |
| **Bricolage Grotesque** | `font-display`            | Headlines, títulos, nome da marca |
| **Inter**               | `font-body` / `font-sans` | Texto corrido, labels, botões     |
| **Space Mono**          | `font-mono`               | Preços, números de pedido, senhas |

> 📖 Referência técnica completa com exemplos de código, tokens e guia para IA: [`docs/design-system.md`](docs/design-system.md)

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

| Fase | Descrição              | Status                        |
| ---- | ---------------------- | ----------------------------- |
| 1    | Fundação               | ✅ Concluída                  |
| 2    | Autenticação e Tenants | ✅ Concluída                  |
| 3    | Loja e Catálogo        | ✅ Concluída (upload pós-MVP) |
| 4    | Loja Pública           | ✅ Concluída                  |
| 5    | Checkout e Pedidos     | ✅ Concluída                  |
| 6    | Painel Operacional     | ✅ Concluída                  |
| 7    | Qualidade e Deploy     | 🚧 Em andamento               |

## Limitações do MVP

- Sem pagamentos online (PIX manual via WhatsApp)
- Realtime depende da configuração do Pusher; sem as chaves, os eventos ficam desabilitados
- Sem Redis (rate limiting in-memory)
- Sem app mobile nativo (PWA-friendly)
- Sem rastreamento de entrega
- Sem cálculo de frete por distância

## Roadmap

Veja `docs/roadmap.md`.

## Qualidade

A estratégia, a matriz atual e os comandos de testes estão documentados em
[`docs/testing.md`](docs/testing.md). O fluxo local inclui Vitest, testes de integração,
Playwright em desktop/mobile, lint, typecheck e build de produção.

## Licença

Proprietário — Todos os direitos reservados.
