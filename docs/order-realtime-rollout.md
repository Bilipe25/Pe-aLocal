# Rollout do realtime de pedidos

O dashboard novo usa canais Pusher privados e polling de reconciliação. Faça a
transição sem interromper abas antigas:

1. Configure no ambiente de build `NEXT_PUBLIC_PUSHER_KEY` e
   `NEXT_PUBLIC_PUSHER_CLUSTER`.
2. Configure no Worker os secrets `PUSHER_APP_ID`, `PUSHER_KEY`,
   `PUSHER_SECRET` e `PUSHER_CLUSTER`.
3. No primeiro deploy, defina temporariamente
   `PUSHER_LEGACY_PUBLIC_CHANNELS=true`. O servidor publicará nos canais privado
   e legado enquanto as abas antigas expiram.
4. Após o maior turno operacional ou janela de sessão ativa, remova a variável
   e faça novo deploy. O servidor passará a publicar somente no canal privado.

O modo legado deve ser temporário porque o canal `store-*` não possui
autorização. O polling permanece ativo em qualquer etapa e assume a atualização
quando o Pusher estiver ausente ou degradado.

## Outbox e Queue

O PostgreSQL é a fonte da verdade. Cada mutação cria o evento de outbox na mesma
transação; Pusher e Cloudflare Queues são efeitos posteriores e podem entregar o
mesmo evento mais de uma vez.

Antes do primeiro deploy de cada ambiente:

1. Crie `pedidolocal-order-events-<ambiente>` e
   `pedidolocal-order-events-<ambiente>-dlq` no mesmo account Cloudflare.
2. Use em `DATABASE_URL` as mesmas credenciais de origem do Hyperdrive. Após a
   migration, o workflow verifica `SELECT`, `INSERT`, `UPDATE`, propriedade da
   tabela ou `BYPASSRLS` auditado antes de publicar qualquer Worker.
3. Configure `DIRECT_URL`, `DATABASE_URL` e as quatro chaves Pusher no
   environment protegido do GitHub. Secrets do Worker principal não são
   compartilhados com o Worker companion.
4. Execute o workflow autorizado. Ele verifica as Queues, aplica migrations,
   configura os secrets do companion, publica o consumer/relay e só então
   publica a aplicação.

O rollout do producer é explícito em `wrangler.jsonc`:

1. `direct`: publica pelo caminho legado e marca a outbox processada; falhas
   permanecem disponíveis ao relay.
2. `dual`: publica diretamente e também enfileira. Duplicatas são esperadas e o
   dashboard deve reconciliar pelo `version` do pedido.
3. `outbox`: somente agenda a Queue; `waitUntil` evita bloquear a resposta e o
   cron recupera qualquer enqueue perdido.

Promova para `dual` somente depois de confirmar consumer sem backlog e polling
saudável em staging. Promova para `outbox` após uma janela operacional sem
eventos `FAILED`. Para rollback, retorne primeiro a `direct`; não remova tabela,
Queue ou companion enquanto houver eventos pendentes.

## DLQ e replay

Monitore logs `ORDER_OUTBOX_DEAD_LETTER`, linhas `FAILED` e profundidade das
DLQs. Para replay, configure `DIRECT_URL` e `OUTBOX_REPLAY_OPERATOR` em um
terminal administrativo e execute
`pnpm db:outbox:replay -- <eventId>`. O comando aceita somente eventos `FAILED`,
restaura o estado de entrega atomicamente e registra uma auditoria técnica. O
cron os envia novamente à Queue principal. Reenfileirar diretamente uma
mensagem da DLQ sem restaurar a linha não publica o evento; nunca altere esse
estado por SQL ad hoc em produção.
