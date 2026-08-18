---
version: 1
slug: 'src-app-dashboard-dashboard-kds-page-tsx'
primary_target: 'src/app/(dashboard)/dashboard/kds/page.tsx'
related_targets: ['src/components/kds/kds-board.tsx', 'src/components/kds/kds-order-card.tsx']
---

Surface: `/dashboard/kds` — Tela da cozinha autenticada.

Thesis: uma passagem de comandas legível sob pressão, não um kanban genérico. O operador deve
identificar o pedido mais antigo, ler restrições e executar exatamente a próxima transição oficial.

World: Papel/Tinta com Kraft, Azulejo e Erva por etapa; Pimenta reservada à ação principal.
Tipografia e tokens pertencem ao sistema PedidoLocal. Sem gradientes, vidro, preenchimentos
agressivos, animação contínua ou estado transmitido somente por cor.

Information architecture: cabeçalho compacto com loja, conexão, som e tela cheia; três trilhos
desktop/tablet (A fazer, Em preparo, Prontos); tabs com navegação por teclado no mobile; tickets com
número, tempo, modalidade, itens, opções, observações e uma única ação primária.

Behavior: `Order` é a única fonte da verdade. KDS e Central reutilizam actions e services oficiais,
CAS por version, history, outbox e Pusher. Realtime invalida consultas; polling reconcilia. Sem
otimismo de status, drag-and-drop ou comunicação direta entre superfícies. Conflito informa que o
pedido já foi atualizado em outro dispositivo.

Responsive and access: três colunas acima de 767px, uma etapa visível por tab abaixo disso; alvos
de 44px ou mais; timer sem aria-live; labels e ícones complementam cor; reduced-motion respeitado.

Approved references: prototype screenshots at
`C:/Users/netes/.codex/visualizations/2026/08/17/01a01224-b688-7490-9e88-61158444a7ca/kds-prototype/`.
