# Banco de Dados — PedidoLocal

## Tecnologias

- **Banco**: PostgreSQL (Supabase)
- **ORM**: Prisma
- **Migrations**: Prisma Migrate
- **Visualização**: Prisma Studio

## Modelos

| Modelo | Descrição |
|---|---|
| `User` | Usuários do sistema |
| `Session` | Sessões autenticadas |
| `Tenant` | Estabelecimentos |
| `TenantMember` | Vínculo usuário ↔ tenant |
| `Store` | Lojas públicas |
| `StoreSettings` | Configurações da loja |
| `StoreAddress` | Endereço da loja |
| `OpeningHour` | Horários de funcionamento |
| `Category` | Categorias do cardápio |
| `Product` | Produtos |
| `ProductOptionGroup` | Grupos de adicionais |
| `ProductOption` | Opções de um grupo |
| `DeliveryZone` | Zonas de entrega |
| `Customer` | Clientes (dados do checkout) |
| `CustomerAddress` | Endereços de clientes |
| `Order` | Pedidos |
| `OrderItem` | Itens do pedido (snapshot) |
| `OrderItemOption` | Opções selecionadas (snapshot) |
| `OrderStatusHistory` | Histórico de status |
| `Payment` | Pagamentos |
| `Coupon` | Cupons de desconto |
| `CouponUsage` | Uso de cupons |
| `AuditLog` | Log de auditoria |

## Convenções

- **Chave primária**: UUID v4
- **Valores monetários**: Inteiros em centavos (`Int`)
- **Timestamps**: `createdAt` e `updatedAt` em todos os modelos
- **Nomes de tabela**: snake_case via `@@map()`
- **Exclusão lógica**: Apenas quando necessária (`isActive`)
- **Índices**: Em todas as chaves estrangeiras e campos de busca

## Diagrama de Relacionamentos

```
User ──────── Session
  │
  └─── TenantMember ──── Tenant
                           │
                           ├── Store
                           │    ├── StoreSettings
                           │    ├── StoreAddress
                           │    ├── OpeningHour
                           │    ├── Category ── Product ── ProductOptionGroup ── ProductOption
                           │    ├── DeliveryZone
                           │    └── Order ── OrderItem ── OrderItemOption
                           │         ├── OrderStatusHistory
                           │         └── Payment
                           │
                           ├── Customer ── CustomerAddress
                           ├── Coupon ── CouponUsage
                           └── AuditLog
```

## Conexão

- **Aplicação**: Usa `DATABASE_URL` com pooling (PgBouncer do Supabase, porta 6543)
- **Migrations**: Usa `DIRECT_URL` com conexão direta (porta 5432)
- **Desenvolvimento**: Prisma Client singleton para evitar vazamento de conexões

## Comandos

```bash
pnpm db:generate   # Gerar Prisma Client
pnpm db:migrate    # Executar migrations (dev)
pnpm db:deploy     # Deploy migrations (prod)
pnpm db:seed       # Popular banco com dados demo
pnpm db:studio     # Abrir Prisma Studio
pnpm db:validate   # Validar schema
pnpm db:push       # Push schema sem migration (dev)
```
