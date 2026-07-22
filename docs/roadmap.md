# Roadmap — PedidoLocal

## Fase 1 — Fundação ✅

- [x] Next.js 16 + TypeScript strict
- [x] Tailwind CSS v4 + shadcn/ui
- [x] Prisma + Schema completo
- [x] Estrutura de pastas por domínio
- [x] Design tokens e componentes base
- [x] Sistema de erros de domínio
- [x] Interface de rate limiting
- [x] Interface de storage
- [x] Sistema de permissões
- [x] Validação de variáveis de ambiente
- [x] Middleware de segurança
- [x] Health check
- [x] Documentação básica
- [x] Configuração de testes (Vitest + Playwright)

## Fase 2 — Autenticação e Tenants ✅

- [x] Modelo de sessão com cookies httpOnly
- [x] Login com Argon2
- [x] Logout com revogação de sessão
- [x] Proteção de rotas (middleware)
- [x] Registro de tenant
- [x] Vínculo usuário ↔ tenant
- [x] Funções e permissões
- [x] Isolamento multi-tenant
- [x] Rate limiting no login
- [x] Proteção contra enumeração

## Fase 3 — Loja e Catálogo ✅

- [x] CRUD de loja e configurações
- [x] Horários de funcionamento
- [x] CRUD de categorias
- [x] CRUD de produtos
- [x] CRUD de grupos de adicionais
- [x] CRUD de zonas de entrega
- [x] Validação de slug
- [x] Configuração de Pix
- [ ] Upload de logo e capa (pós-MVP — Vercel Blob)

## Fase 4 — Loja Pública ✅

- [x] Rota dinâmica por slug
- [x] Página pública da loja
- [x] Exibição do cardápio
- [x] Seleção de adicionais
- [x] Cache com revalidação
- [x] Carrinho com Zustand
- [x] Validação de loja aberta/fechada

## Fase 5 — Checkout e Pedidos ✅

- [x] Formulário de checkout
- [x] Cálculo de preços no servidor
- [x] Transação atômica para criação de pedido
- [x] Idempotência
- [x] Pix manual (copia e cola + WhatsApp)
- [x] Consulta pública de pedido
- [x] Snapshot de itens e preços

## Fase 6 — Painel Operacional ✅

- [x] Lista de pedidos em tempo real (Pusher WebSockets)
- [x] TanStack Query integrado
- [x] Detalhes e Status do pedido
- [x] Atualização de status e Pusher trigger
- [x] Confirmação manual de pagamento Pix/Dinheiro
- [x] Filtros por Data/Status
- [x] Dashboard com métricas do dia

## Fase 7 — Qualidade e Deploy

- [x] Testes unitários de services
  - [x] AuthService (login, logout, sessão e rate limit)
  - [x] TenantService (owner, membros e conflitos)
- [x] Testes de integração
  - [x] Route Handlers de health e autenticação
- [ ] Testes E2E com Playwright
  - [x] Smoke test da home, login e health check
  - [x] Execução desktop e mobile
  - [ ] Fluxo de compra e acompanhamento do pedido
  - [ ] Fluxo autenticado do painel operacional
- [ ] Acessibilidade (WCAG)
  - [x] Associação de erros e campos no login
  - [x] Landmarks e heading principal no login
  - [ ] Auditoria automatizada de todas as rotas críticas
- [ ] Performance (Core Web Vitals)
- [ ] Documentação completa
  - [x] README e guia de testes alinhados ao estado atual
- [x] Build de produção local
- [ ] Deploy na Vercel

---

## Futuro (pós-MVP)

- Supabase Realtime (WebSockets) para pedidos em tempo real
- Integração com gateways de pagamento (Mercado Pago, Efí, Asaas)
- Redis (Upstash) para rate limiting e cache 
- Impressão de comanda térmica
- Cupons automáticos
- Relatórios avançados
- Programa de fidelidade
- App PWA (Progressive Web App)
- Notificações push
- Múltiplas lojas por tenant
