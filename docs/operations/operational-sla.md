# SLA operacional de aceite

O recurso **Pedido não atendido / SLA operacional** destaca pedidos que permanecem em `PENDING` depois da ativação do entitlement da loja. Ele não aceita, cancela nem altera pedidos automaticamente.

## Contrato

- O ciclo começa em `Order.statusChangedAt` quando o pedido entra em `PENDING`.
- Pedidos anteriores a `StoreEntitlement.operationalSlaEnabledAt` não recebem timer, destaque nem Push retroativo.
- Menos de 2 minutos é `NORMAL`; de 2:00 a 3:59 é `WARNING`; a partir de 4:00 é `CRITICAL`.
- Sair de `PENDING`, trocar o `statusChangedAt` ou desativar o entitlement encerra o ciclo.
- Um retorno a `PENDING` cria outro ciclo. O unique `(orderId, actionableAt, stage)` limita cada estágio a uma ocorrência e `(slaAlertId, webPushSubscriptionId)` limita cada dispositivo a uma entrega.
- Se a primeira detecção ocorrer depois de quatro minutos, somente `CRITICAL` é criado.

## Execução

O cron existente de `workers/order-events/worker.ts` executa blocos isolados de resolução, detecção e entrega. A detecção processa até 100 candidatos e a entrega até 25 deliveries por execução. Não há nova Queue, binding, segredo, Worker ou dependência.

Antes de cada Push, o Worker revalida pedido, ciclo, entitlement, tenant, loja, usuário, membership, permissão, associação administrativa e inscrição. Um `WARNING` pendente é descartado como `superseded` quando o ciclo já alcançou `CRITICAL`. As tentativas compartilham a política de Web Push: lease de dois minutos, cinco tentativas, `Retry-After`, backoff de até cinco minutos e revogação em `404/410`.

O payload mantém `audience: merchant` e `type: new-order`, adicionando `reminderStage`. Assim, Service Workers antigos continuam abrindo o pedido. A versão nova preserva o badge ao clicar no reminder; o badge sempre representa a quantidade de pedidos `PENDING`, não notificações.

## Operação e privacidade

Os Pushes carregam somente IDs técnicos, número do pedido, estágio, deep link, ícone e contagem operacional. Não carregam cliente, telefone, endereço, observações, e-mail ou pagamento. As tabelas têm RLS e acesso direto revogado.

Eventos de log: `OPERATIONAL_SLA_WARNING_CREATED`, `OPERATIONAL_SLA_CRITICAL_CREATED`, `OPERATIONAL_SLA_PUSH_SENT`, `OPERATIONAL_SLA_PUSH_RETRY`, `OPERATIONAL_SLA_SKIPPED_STALE`, `OPERATIONAL_SLA_SKIPPED_DISABLED` e `OPERATIONAL_SLA_RESOLVED`.

## Rollout e rollback

1. Aplicar a migration aditiva.
2. Publicar o código com as lojas desabilitadas.
3. Habilitar uma única loja descartável de staging e validar os limites, aceite antes do envio, undo, múltiplos dispositivos e badge.
4. Só então considerar outra loja ou produção em uma etapa autorizada.

O rollback funcional é definir `operationalSlaEnabled=false`. A transação limpa `operationalSlaEnabledAt`, resolve alerts e marca deliveries pendentes como `SKIPPED`; pedidos, pagamentos, Pusher e Merchant Push inicial continuam intactos.

O cron de um minuto pode atrasar o Push em até aproximadamente 59 segundos, além de backlog. Há também uma pequena janela distribuída entre a última revalidação e a aceitação pelo provedor Push; TTL curto, tag estável e o deep link consultando o estado atual reduzem o impacto.
