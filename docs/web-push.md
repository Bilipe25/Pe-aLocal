# Web Push transacional

O Web Push do PedidoLocal possui dois públicos independentes: avisa o consumidor sobre mudanças de status e alerta operadores sobre novos pedidos acionáveis. Ele complementa Pusher e polling; as consultas HTTP continuam sendo a fonte de verdade.

## Alertas operacionais da Central

O operador ativa explicitamente **Alertas** no cabeçalho de `/dashboard/orders`. A associação `StoreStaffPushSubscription` liga sessão, loja e dispositivo sem confiar em IDs enviados pelo cliente. Somente `ORDER_CREATED` cujo pedido ainda está em `PENDING` gera uma entrega; aceitar, cancelar ou mover o pedido antes do envio transforma a entrega em `SKIPPED`.

O título usa o número visível do pedido e o corpo usa apenas total, modalidade e quantidade de itens. Nome, telefone, endereço, notas, token e dados de pagamento não entram no payload. O deep link autenticado seleciona a loja após validar tenant, permissões e ownership do pedido.

Os ledgers `StoreWebPushDispatch` e `StoreWebPushDelivery` são independentes dos ledgers do consumidor e do Pusher. O alerta usa TTL de 120 segundos, urgência alta, `renotify` e `requireInteraction` progressivo. O badge representa pedidos `PENDING` agregados nas lojas ativas daquele usuário e dispositivo.

O endpoint `/dashboard/api/push-subscription` consulta, ativa e desativa somente a loja ativa. O endpoint `/dashboard/api/push-subscription/test` usa a service binding `ORDER_EVENTS_WORKER`; não aceita endpoint arbitrário, não cria delivery e não altera badge. No logout, todas as associações administrativas do usuário naquele dispositivo são desabilitadas antes de encerrar a sessão.

## Escopo e privacidade

O consumidor recebe Push em todas as etapas operacionais: `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED` e `CANCELLED`, respeitando as etapas aplicáveis a cada modalidade. Criação, pagamentos, notas internas e reversões não geram Push.

Título, corpo e tag não contêm nome do cliente, número do pedido, endereço, valor, pagamento ou token público. O token aparece apenas no link privado de navegação. Logs registram IDs técnicos, resultado e código HTTP; endpoint e chaves nunca devem ser logados.

Uma inscrição do navegador pode acompanhar vários pedidos. Desativar notificações em um pedido desabilita apenas `OrderPushSubscription`; não executa `PushSubscription.unsubscribe()`.

## Componentes

- `WebPushSubscription`: endpoint e material criptográfico da inscrição, com revogação lógica.
- `OrderPushSubscription`: associação habilitável entre inscrição e pedido.
- `WebPushDispatch`: projeção idempotente de um evento do outbox.
- `WebPushDelivery`: ledger independente por evento+inscrição, com lease, tentativas e resultado.
- `/api/orders/track/[token]/push-subscription`: reconciliação, ativação e desativação same-origin.
- `public/sw.js`: handlers `push` e `notificationclick`, além do cache/fallback existente.

No caminho Queue, o Worker projeta e tenta entregar o Push antes e independentemente da publicação Pusher. As duas ramificações possuem ledger, locks e tentativas próprios: falhar em uma não repete nem bloqueia a outra. O cron reconcilia eventos ausentes e cobre também `ORDER_EVENT_PUBLISH_MODE=direct`.

Cada pedido reutiliza uma única `tag`, substituindo a notificação anterior. Todas as notificações operacionais usam `renotify`, incluindo confirmação, preparo, pedido pronto, saída para entrega, conclusão e cancelamento.

## Configuração

Gere uma única chave VAPID de longa duração. A chave pública deve ser a mesma no aplicativo e no Worker auxiliar.

| Variável                     | Aplicativo | Worker auxiliar | Sensível |
| ---------------------------- | ---------: | --------------: | -------: |
| `WEB_PUSH_ENABLED`           |        Sim |             Sim |      Não |
| `MERCHANT_WEB_PUSH_ENABLED`  |        Sim |             Sim |      Não |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  |        Sim |             Sim |      Não |
| `WEB_PUSH_VAPID_PRIVATE_KEY` |        Não |             Sim |      Sim |
| `WEB_PUSH_VAPID_SUBJECT`     |        Não |             Sim |      Não |

Use `wrangler secret put` para as chaves em cada ambiente; não versione valores reais. A configuração padrão de produção permanece desligada; staging só deve ficar ativo depois de publicar a migration e configurar as três propriedades VAPID.

Rotação VAPID não é automática: inscrições existentes estão vinculadas à chave usada no `subscribe()`. Uma rotação exige plano de reinscrição e não deve ser feita como correção rotineira.

## Entrega e erros

- `2xx`: `SENT`.
- `404/410`: inscrição `REVOKED`, associações ativas desabilitadas e sem retry.
- `429`, `5xx` ou falha de rede: no máximo cinco tentativas, respeitando `Retry-After` numérico e backoff limitado a cinco minutos.
- Outros `4xx`: `FAILED` permanente, sem revogar globalmente o navegador.
- Configuração incompleta: nenhum delivery é reivindicado ou tem tentativas consumidas.

Entregas de uma mesma associação são serializadas. Antes de enviar, o processador consulta o status atual e descarta versões superadas. Nome, slug e ícone são resolvidos novamente a partir da configuração publicada.

## Rollout e rollback

1. Publique código e migration com a flag desligada.
2. Configure VAPID no staging e ative aplicativo e Worker.
3. Valide Android/Chromium e iOS/iPadOS com a PWA adicionada à Tela de Início.
4. Teste as matrizes de entrega e retirada, domínio customizado, `404/410` e ausência de duplicação Pusher.
5. Repita em produção.

Não ative o Push operacional em produção enquanto `ORDER_EVENT_PUBLISH_MODE=direct`: nesse modo, a reconciliação pode depender do cron e atrasar o alerta em aproximadamente um minuto. Use `dual` ou `outbox` com a Queue saudável.

Para rollback do consumidor, desligue `WEB_PUSH_ENABLED`. Para rollback operacional, desligue somente `MERCHANT_WEB_PUSH_ENABLED`. Não remova tabelas nem gire VAPID. Pusher, polling e as telas continuam funcionando.

## Limitações conhecidas

- Inscrições são específicas por origem; domínio principal e domínio customizado não compartilham a mesma inscrição.
- O modo `direct` pode depender do cron e acrescentar até aproximadamente um minuto.
- iOS/iPadOS exige instalação na Tela de Início.
- Badge é progressivo e varia por plataforma.
- A allowlist de hosts Push deve ser revisada ao adotar novos navegadores/provedores.
- Lembretes, campanhas, marketing, ações de aceitar/cancelar e preferências avançadas não fazem parte desta fase.
