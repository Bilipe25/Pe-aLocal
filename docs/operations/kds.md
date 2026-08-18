# Tela da cozinha (KDS)

A Tela da cozinha é uma projeção operacional da entidade `Order`. Ela não cria pedido, estado,
histórico ou fluxo paralelo: Central e KDS leem a mesma fonte e executam as mesmas transições de
domínio.

## Contrato

- `CONFIRMED` aparece em **A fazer** e avança por `startOrderPreparationAction`.
- `PREPARING` aparece em **Em preparo** e avança por `markOrderReadyAction`.
- `READY` aparece em **Prontos** e não possui nova transição dentro do KDS.
- Qualquer outro status, inclusive cancelamento e saída de `READY`, não aparece no snapshot.
- Ações enviam a `version` lida no card. O CAS existente torna a primeira transição válida
  vencedora e rejeita a segunda sem duplicar histórico, outbox ou notificações.

Não existem actions ou services exclusivos para transições do KDS. Isso preserva
`OrderStatusHistory`, timestamps, outbox, Pusher, pushes, auditoria e observabilidade do fluxo
oficial.

## Autorização e dados

A rota `/dashboard/kds` exige loja ativa, entitlement `kdsEnabled`, `VIEW_ORDERS` e
`UPDATE_ORDER_STATUS`. O servidor deriva `tenantId` e `storeId` da sessão e da loja ativa; nenhum
escopo enviado pelo navegador autoriza a consulta.

O snapshot traz somente dados necessários à cozinha: ID técnico, número, modalidade, status,
versão, início da etapa, itens, adicionais e observações de preparo. Cliente, telefone, endereço,
e-mail e pagamento não fazem parte do DTO.

## Sincronização

O canal privado já usado pela Central publica `order-updated` por loja. Central, KDS e outros
tablets recebem o mesmo evento e invalidam suas próprias consultas; nenhuma superfície conversa
diretamente com outra. Se o Pusher estiver indisponível, o KDS mantém polling de 20 segundos; com
realtime conectado, faz uma reconciliação de segurança a cada 60 segundos.

Após uma mutação local, o KDS espera a resposta do servidor e revalida os caches do KDS, quadro,
fila, métricas e detalhe. Não há mudança otimista de status. Em conflito, mostra: “Este pedido já
foi atualizado em outro dispositivo.”

## Operação e limites

- As três filas são ordenadas pela entrada na etapa, com desempate por ID.
- O snapshot carrega no máximo 200 cards, distribui o orçamento entre as três etapas e reaproveita
  capacidade ociosa; assim, um backlog de uma coluna não esconde completamente as demais. Os totais
  vêm de contagem separada.
- Um ticker compartilhado atualiza todos os tempos uma vez por segundo.
- Alertas visuais reutilizam os thresholds operacionais existentes; não há configuração paralela.
- O som é opt-in por dispositivo e toca quando um pedido entra em `CONFIRMED`, nunca no primeiro
  carregamento.
- A interface possui três trilhos em desktop/tablet e tabs acessíveis no mobile, sem drag-and-drop.

## Checklist de staging

1. Habilitar `kdsEnabled` apenas em uma loja descartável.
2. Abrir Central e KDS em dispositivos diferentes.
3. Iniciar preparo na Central e confirmar a movimentação automática no KDS.
4. Marcar pronto no KDS e confirmar a movimentação automática na Central e em outro KDS.
5. Cancelar na Central e confirmar a remoção no KDS.
6. Disparar duas ações simultâneas sobre a mesma versão e confirmar um único sucesso.
7. Desligar temporariamente o realtime e confirmar banner, polling e recuperação.

Não é necessária migration: o entitlement `kdsEnabled` e os estados oficiais de `Order` já
existiam.
