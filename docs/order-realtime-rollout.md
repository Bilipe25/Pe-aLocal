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
