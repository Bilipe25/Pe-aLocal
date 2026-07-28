# Checkout v2 — rollout e rollback

## Ordem obrigatória

1. Confirme pelo Project Ref que `DIRECT_URL` e `DATABASE_URL` apontam para o ambiente autorizado.
2. Faça backup lógico de `orders`, `order_items`, `coupons`, `coupon_usages` e `delivery_zones`.
3. Meça `orders` e reserve uma janela para o backfill de expiração.
4. Execute `pnpm db:deploy` usando a conexão direta. As cinco migrations são intencionalmente
   separadas em expansão, backfill, índice concorrente, validação e `NOT NULL`.
5. Cadastre ao menos uma faixa de CEP ativa para cada loja ativa com entrega habilitada.
6. Execute `pnpm db:checkout-v2:preflight`. O deploy da aplicação deve permanecer bloqueado enquanto
   houver cobertura ausente, cupom ativo sem loja, expiração nula, índice inválido ou constraint não
   validada.
7. O smoke E2E do runtime Cloudflare é opcional no workflow de deploy e permanece desativado por
   padrão. Para executá-lo em staging, marque `run_e2e_smoke` e configure as variáveis E2E. Faça o
   soak antes de qualquer promoção para produção.

O preflight abre uma transação `READ ONLY`, registra somente contagens, slugs públicos e nomes de
constraints e nunca altera dados.

## Recuperação de falha

- Se o índice concorrente falhar, inspecione `pg_index.indisvalid` e `pg_index.indisready`. Remova
  somente o índice inválido, marque a migration de acordo com o estado real usando `prisma migrate
resolve` e repita a etapa. Não marque uma migration como aplicada sem conferir o banco.
- Se o lock curto da migration final expirar, mantenha a aplicação anterior e repita a migration em
  uma janela com menos tráfego.
- Se o preflight reprovar cobertura, mantenha a aplicação anterior, cadastre as faixas e execute o
  preflight novamente. Não reative a entrega no navegador nem aceite zona enviada pelo cliente.

## Rollback

O rollback operacional preferido é republicar a versão anterior da aplicação e manter o schema
aditivo. Isso preserva pedidos, endereços estruturados, cupons por loja e faixas de CEP criados após
a migration.

O arquivo `prisma/migrations/20260727230000_checkout_v2_foundation/rollback.sql` é destrutivo e não
deve ser executado pelo Prisma. Use-o somente depois de exportar todos os dados novos, interromper
escritas e confirmar que nenhuma versão do checkout v2 está ativa. A remoção física deve ocorrer em
uma migration posterior, nunca como reação automática a uma falha de deploy.
