# Web Push transacional

O Web Push do PedidoLocal avisa o consumidor sobre mudanças de status de um pedido. Ele complementa Pusher e polling: a tela de acompanhamento e sua consulta HTTP continuam sendo a fonte de verdade.

## Escopo e privacidade

São notificáveis somente `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED` e `CANCELLED`. Criação, pagamentos, notas internas e reversões não geram Push.

Título, corpo e tag não contêm nome do cliente, número do pedido, endereço, valor, pagamento ou token público. O token aparece apenas no link privado de navegação. Logs registram IDs técnicos, resultado e código HTTP; endpoint e chaves nunca devem ser logados.

Uma inscrição do navegador pode acompanhar vários pedidos. Desativar notificações em um pedido desabilita apenas `OrderPushSubscription`; não executa `PushSubscription.unsubscribe()`.

## Componentes

- `WebPushSubscription`: endpoint e material criptográfico da inscrição, com revogação lógica.
- `OrderPushSubscription`: associação habilitável entre inscrição e pedido.
- `WebPushDispatch`: projeção idempotente de um evento do outbox.
- `WebPushDelivery`: ledger independente por evento+inscrição, com lease, tentativas e resultado.
- `/api/orders/track/[token]/push-subscription`: reconciliação, ativação e desativação same-origin.
- `public/sw.js`: handlers `push` e `notificationclick`, além do cache/fallback existente.

O Worker de eventos projeta o Push depois que o Pusher é confirmado, mas esse passo é best-effort. O cron reconcilia eventos ausentes e cobre também `ORDER_EVENT_PUBLISH_MODE=direct`. Falhas do Push nunca alteram o outbox nem repetem Pusher.

## Configuração

Gere uma única chave VAPID de longa duração. A chave pública deve ser a mesma no aplicativo e no Worker auxiliar.

| Variável                     | Aplicativo | Worker auxiliar | Sensível |
| ---------------------------- | ---------: | --------------: | -------: |
| `WEB_PUSH_ENABLED`           |        Sim |             Sim |      Não |
| `WEB_PUSH_VAPID_PUBLIC_KEY`  |        Sim |             Sim |      Não |
| `WEB_PUSH_VAPID_PRIVATE_KEY` |        Não |             Sim |      Sim |
| `WEB_PUSH_VAPID_SUBJECT`     |        Não |             Sim |      Não |

Use `wrangler secret put` para as chaves em cada ambiente; não versione valores reais. `WEB_PUSH_ENABLED` permanece `false` no repositório. Ative somente depois de publicar a migration e configurar as três propriedades VAPID.

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
4. Teste os seis estados, domínio customizado, `404/410` e ausência de duplicação Pusher.
5. Repita em produção.

Para rollback, desligue `WEB_PUSH_ENABLED` nos dois Workers. Não remova tabelas nem gire VAPID. Pusher, polling e a página de acompanhamento continuam funcionando.

## Limitações conhecidas

- Inscrições são específicas por origem; domínio principal e domínio customizado não compartilham a mesma inscrição.
- O modo `direct` pode depender do cron e acrescentar até aproximadamente um minuto.
- iOS/iPadOS exige instalação na Tela de Início.
- Badge é progressivo e varia por plataforma.
- A allowlist de hosts Push deve ser revisada ao adotar novos navegadores/provedores.
- Push de lojistas, campanhas, marketing e preferências globais não fazem parte desta fase.
