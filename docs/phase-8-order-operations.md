# Fase 8 — Experiência operacional da Central de Pedidos

## Escopo entregue

- tempo da etapa atual e duração de aceite, preparo, espera, entrega e total;
- alertas operacionais centralizados e testáveis;
- próxima ação operacional indicada no cartão, respeitando capacidades do servidor;
- observações internas privadas, paginadas e carregadas sob demanda;
- concorrência otimista também ao adicionar observação interna;
- auditoria e outbox sem copiar o conteúdo privado da observação;
- histórico operacional detalhado;
- painel lateral no desktop e bottom sheet com ações fixas no mobile;
- última sincronização, atualização manual e acesso ao cardápio da loja ativa.

## Alertas padrão

Os valores ficam centralizados em `src/domain/orders/order-operations.ts`:

- sem aceite após 3 minutos;
- pedido aceito sem início do preparo após 5 minutos;
- preparo acima do tempo máximo configurado na loja;
- pronto para retirada após 15 minutos;
- pronto aguardando despacho após 5 minutos;
- entrega acima do maior valor entre 15 minutos e o tempo máximo da loja;
- Pix pendente após 10 minutos;
- pagamento informado pelo cliente aguardando análise.

Esses alertas orientam a operação. Eles não alteram status e não autorizam ações.

## Migration

Migration: `20260722213000_order_internal_notes`.

A alteração é aditiva. A tabela usa chave estrangeira composta para garantir que a
observação pertença simultaneamente ao pedido, tenant e loja informados. Não existe
backfill porque não havia fonte legada para observações internas.

Ordem de staging:

1. criar backup do banco de staging;
2. executar `pnpm db:deploy` com a `DATABASE_URL` de staging;
3. executar `pnpm db:validate`;
4. publicar o Worker de staging;
5. validar leitura e escrita de observações com OWNER, MANAGER e ATTENDANT;
6. confirmar que outra loja não lê nem grava observações do pedido.

## Rollback

1. reimplantar a versão anterior do Worker;
2. manter a tabela durante a investigação para preservar dados;
3. se o rollback de banco for realmente necessário, exportar as observações e remover
   `order_internal_notes`;
4. manter o valor `ORDER_INTERNAL_NOTE_ADDED` no enum PostgreSQL, pois um valor não
   utilizado é compatível e sua remoção seria desnecessariamente destrutiva.

O rollback do Worker e o rollback do banco são operações independentes.

## Checklist manual

- abrir a Central em 390 px, tablet e desktop;
- verificar que ações principais permanecem acessíveis no rodapé do detalhe;
- confirmar foco, Escape e leitura do título no bottom sheet;
- adicionar observação interna e confirmar autor e horário;
- simular duas sessões e confirmar conflito de versão;
- validar que telefone e endereço ficam protegidos sem a permissão correspondente;
- confirmar que a fila e eventos Pusher não contêm telefone, endereço ou texto da nota;
- verificar alertas de aceite, preparo, retirada, despacho, entrega e pagamento;
- desconectar o Pusher e confirmar atualização por polling e botão Atualizar.
