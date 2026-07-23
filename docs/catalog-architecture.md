# Arquitetura e Ciclo de Vida do Catálogo — PedidoLocal

Documentação técnica do módulo de Catálogo de Produção do PedidoLocal.

---

## 1. Visão Geral de Arquitetura

O módulo de catálogo opera sob um modelo **Multi-Tenant e Multi-Loja estrito**, garantindo isolamento total de dados e integridade referencial.

```
┌─────────────────────────────────────────────────────────┐
│               Next.js App Router UI                     │
│  /dashboard/catalog · /dashboard/catalog/archived      │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                 Server Actions (Thin)                   │
│  src/features/catalog/actions.ts                        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│               Segurança & Store Context                 │
│  requireActiveStoreContext(Permission.MANAGE_CATALOG)   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│           Repositories & DB Transactions                │
│  category.repo / product.repo / audit-log.repo          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Garantias de Segurança e Integridade

1. **Escopo Composto (`tenantId` + `storeId`):** Todas as atualizações e leituras utilizam filtros compostos para impedir acesso cruzado entre estabelecimentos.
2. **Concorrência Otimista (`version`):** Entidades possuem controle de versão numérico (`version`). Edições simultâneas disparam `ConcurrencyError` (HTTP 409) solicitando recarregamento sem corromper o estado.
3. **Auditoria Atômica:** Qualquer mutação em categorias ou produtos cria um registro de `AuditLog` dentro de uma transação Prisma atômica (`$transaction`).
4. **Soft-Delete (Arquivamento Lógico):** Deleções físicas foram substituídas por `archivedAt`, `archivedById` e `archiveReason`. Os itens podem ser consultados e restaurados a qualquer momento em `/dashboard/catalog/archived`.

---

## 3. Matriz de Permissões

| Permissão                     | OWNER | MANAGER | ATTENDANT |
| ----------------------------- | :---: | :-----: | :-------: |
| `VIEW_CATALOG`                |  ✅   |   ✅    |    ✅     |
| `MANAGE_CATALOG`              |  ✅   |   ✅    |    ❌     |
| `MANAGE_PRODUCT_AVAILABILITY` |  ✅   |   ✅    |    ✅     |
| `MANAGE_PRODUCT_IMAGES`       |  ✅   |   ✅    |    ❌     |
| `REORDER_CATALOG`             |  ✅   |   ✅    |    ❌     |
| `ARCHIVE_CATALOG_ITEMS`       |  ✅   |   ✅    |    ❌     |

---

## 4. Validador do Checkout (`cart-validator.ts`)

A integridade do cardápio e checkout é garantida no servidor por `validateCartItem`:

- **Indisponibilidade / Esgotado:** Impede a compra se `isAvailable === false`, `isSoldOut === true` ou `archivedAt !== null`.
- **Grupos Obrigatórios:** Garante que todas as escolhas mínimas e máximas de adicionais sejam respeitadas.
- **Validação de Preços:** Recalcula dinamicamente os valores a partir dos centavos salvos no banco.

---

## 5. Storage de Imagens (Cloudflare R2 & StoreAssets)

- As imagens de produtos são validadas (dimensões mínimas 200x200px, tipos PNG, JPEG, WebP, AVIF, tamanho máx. 3MB).
- O endpoint autenticado `/api/tenant/assets` valida o produto no escopo da loja e cria o `StoreAsset` (tipo `PRODUCT_IMAGE`) no mesmo fluxo que associa o `imageAssetId`.
- A gravação do asset, a associação ao produto, a atualização de versão e a auditoria são atômicas no banco; se falharem, o objeto recém-enviado é removido do R2.
- A prévia do painel usa `/api/tenant/assets/[assetId]`, com sessão e escopo de loja. A vitrine usa somente `/api/store-assets/[assetId]`, que exige tenant e loja publicamente ativos.
- A FK composta `imageAssetId + tenantId + storeId` impede referências a assets inexistentes ou pertencentes a outro estabelecimento.
- A exclusão ou substituição desvincula a imagem, mantém auditoria e agenda assets órfãos para coleta posterior; assets ainda referenciados por produtos não podem ser apagados.
