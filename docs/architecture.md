# Arquitetura — PedidoLocal

## Visão Geral

PedidoLocal é um **monólito modular full-stack** construído com Next.js 16.

O Next.js é responsável por todas as camadas: páginas públicas, painel administrativo, autenticação, autorização, Server Components, Server Actions, Route Handlers, regras de negócio, acesso ao banco e renderização.

## Diagrama de Camadas

```
┌─────────────────────────────────────────────────┐
│                   Navegador                      │
│   (React, Zustand, TanStack Query, RHF)          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│              Next.js (App Router)                 │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  Server      │  │  Route       │  │  Server  │ │
│  │  Components  │  │  Handlers    │  │  Actions │ │
│  └──────┬──────┘  └──────┬───────┘  └────┬─────┘ │
│         │                │               │        │
│  ┌──────▼────────────────▼───────────────▼─────┐ │
│  │           Validação (Zod)                    │ │
│  │           Autenticação (sessão)              │ │
│  │           Autorização (roles)                │ │
│  │           Contexto do tenant                 │ │
│  └──────────────────────┬──────────────────────┘ │
│                         │                        │
│  ┌──────────────────────▼──────────────────────┐ │
│  │              Services                        │ │
│  │   (Regras de negócio + orquestração)         │ │
│  └──────────────────────┬──────────────────────┘ │
│                         │                        │
│  ┌──────────────────────▼──────────────────────┐ │
│  │           Repositories                       │ │
│  │      (Acesso ao banco via Prisma)            │ │
│  └──────────────────────┬──────────────────────┘ │
│                         │                        │
└─────────────────────────┼────────────────────────┘
                          │
               ┌──────────▼──────────┐
               │   PostgreSQL         │
               │   (Supabase)         │
               └─────────────────────┘
```

## Fluxo de Requisição

1. **Componente/Formulário** → envia dados
2. **Server Action ou Route Handler** → recebe dados
3. **Validação com Zod** → valida entrada
4. **Autenticação** → verifica sessão
5. **Autorização** → verifica tenant e role
6. **Service** → executa regra de negócio
7. **Repository** → acessa banco via Prisma
8. **Resposta** → retorna resultado tipado

## Multi-tenancy

- Cada entidade privada possui `tenantId`
- O tenant é identificado pela sessão do usuário
- Nunca confiamos em `tenantId` enviado pelo navegador
- Toda consulta privada inclui o tenant correto

## Decisões Técnicas

| Decisão           | Razão                                                       |
| ----------------- | ----------------------------------------------------------- |
| Monólito          | Simplicidade, menos infra, deploy único                     |
| Server Components | Menos JS no cliente, SSR rápido                             |
| Prisma            | Type-safe, migrations, studio                               |
| Zustand           | Leve, simples, persistência local                           |
| TanStack Query    | Cache e invalidação para o painel                           |
| Pusher            | Eventos em tempo real para pedidos e pagamentos             |
| Cloudflare Queues | Entrega at-least-once do outbox de pedidos                  |
| Web Push          | Avisos do consumidor e da operação, independentes do Pusher |
| Zod               | Validação compartilhada client/server                       |

## O que NÃO usamos

- Microsserviços
- API separada (NestJS, Express)
- Redis (MVP)
- Infraestrutura própria de WebSockets (o realtime usa Pusher)
- Filas adicionais além do pipeline de eventos de pedidos
- App mobile nativo

O SLA de aceite reutiliza o cron do Worker de eventos. Alerts temporais e deliveries possuem ledgers próprios, sem fabricar `OrderOutboxEvent`; `Order.statusChangedAt` identifica o ciclo e o entitlement fornece o watermark de ativação. Veja [`operations/operational-sla.md`](operations/operational-sla.md).

O KDS é uma projeção autenticada de `Order` para `CONFIRMED`, `PREPARING` e `READY`. Central e KDS
chamam as mesmas actions e services de transição, com o mesmo CAS por `version`; o evento privado
`order-updated` apenas solicita que cada superfície releia o servidor. Não existe comunicação
direta Central ↔ KDS nem estado de cozinha paralelo. Veja [`operations/kds.md`](operations/kds.md).
