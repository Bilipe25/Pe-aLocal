---
version: 1
slug: 'src-features-pos-components-pos-workspace-tsx'
primary_target: 'src/features/pos/components/pos-workspace.tsx'
related_targets: ['src/app/(dashboard)/dashboard/pos/page.tsx']
---

# Surface brief — PDV / Novo pedido

- Surface: `/dashboard/pos` and its authenticated server actions.
- Mode: Operate. Fast, repetitive, high-confidence use by store staff during peak service.
- Primary users: attendants, managers and owners on tablet or desktop; mobile is a safe fallback.
- Core task: compose, quote and confirm a canonical order for pickup, delivery or a dining table without leaving the workspace.
- Information hierarchy: modality and contextual customer/table fields; searchable catalog and combos; persistent order rail with payment, canonical totals and final action.
- Interaction contract: touch targets at least 44px, keyboard-visible focus, disabled products remain legible, quote and submit states are explicit, errors stay next to the order decision.
- Visual direction: established PedidoLocal Papel/Tinta/Pimenta/Kraft system; warm craft-floor counter, compact but not ERP-dense, restrained accent use.
- Responsive contract: split catalog/order rail at XL; single flow with fixed bottom confirmation on smaller screens.
- Domain constraints: entitlement and RBAC on page/action/service, no offline queue, no client-side authority over price/tenant/status, no sensitive persistence in PWA caches.
- Completion states: empty cart, unavailable modality/product, lookup not found/found, quote loading/error, blocked store, public-closed warning, submitting, idempotent retry and confirmed success.
