# Arquitetura — PedidoLocal

## Visão Geral

PedidoLocal é um **monólito modular full-stack** construído com Next.js 15.

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

| Decisão | Razão |
|---|---|
| Monólito | Simplicidade, menos infra, deploy único |
| Server Components | Menos JS no cliente, SSR rápido |
| Prisma | Type-safe, migrations, studio |
| Zustand | Leve, simples, persistência local |
| TanStack Query | Polling, cache, invalidação para painel |
| Zod | Validação compartilhada client/server |

## O que NÃO usamos

- Microsserviços
- API separada (NestJS, Express)
- Redis (MVP)
- WebSockets (MVP)
- Filas de processamento (MVP)
- App mobile nativo
