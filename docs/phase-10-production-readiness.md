# Fase 10 — qualidade e prontidão de staging

Este runbook fecha a Central de Pedidos sem publicar produção. O PostgreSQL permanece como fonte da
verdade; Pusher, Queue e polling são mecanismos de entrega e reconciliação.

## Evidências automatizadas

Execute em uma revisão limpa, com Node 22 e pnpm 11.13.0:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm cf:build
pnpm cf:order-events:dry-run:staging
pnpm cf:dry-run:staging
pnpm test:e2e
pnpm test:e2e:a11y
pnpm test:workerd
```

E2E mutável exige `E2E_ALLOW_MUTATIONS=true`, credenciais exclusivas e uma loja descartável. Sem
essa confirmação, os cenários preservam dados e são ignorados com justificativa explícita.

## Cobertura crítica

| Risco                                 | Gate principal                                               |
| ------------------------------------- | ------------------------------------------------------------ |
| transição inválida ou terminal        | máquina de estados e workflow service no Vitest              |
| duas sessões alterando a mesma versão | testes de CAS/conflito e histórico                           |
| pedido duplicado em retry             | idempotência, fingerprint e advisory lock                    |
| colisão de número                     | counter e migrations expand/backfill/cutover                 |
| tenant ou loja incorretos             | autorização, query service e escopo do repositório           |
| pagamento divergente                  | payment workflow, serviço transacional e constraint diferida |
| Pusher indisponível/duplicado         | outbox, deduplicação e polling                               |
| PII no tempo real                     | contratos dos publishers e endpoint público mínimo           |
| regressão mobile/WCAG                 | Playwright mobile e axe WCAG A/AA                            |
| runtime incompatível                  | Next build, OpenNext build, workerd e dry-run Wrangler       |

## Migrations da Central de Pedidos

Aplicar somente por `prisma migrate deploy`, nesta ordem já registrada no ledger:

1. `20260721223000_order_operational_safety`;
2. `20260721233000_order_atomic_audit`;
3. `20260722003000_order_query_indexes`;
4. `20260722013000_order_number_counter_expand`;
5. `20260722014000_order_number_counter_backfill`;
6. `20260722015000_order_number_counter_cutover`;
7. `20260722023000_order_transactional_outbox`;
8. `20260722170000_payment_lifecycle_expand`;
9. `20260722170500_payment_history_expand`;
10. `20260722171000_payment_lifecycle_backfill`;
11. `20260722172000_payment_consistency_guard`;
12. `20260722213000_order_internal_notes`.

Não use `prisma db push`. Antes da aplicação, faça backup, confira o ledger, valide privilégios do
runtime e execute o preflight financeiro. As fases 9 e 10 não adicionam migration.

## Ordem segura de staging

1. Criar snapshot/backup e registrar a versão atual dos dois Workers.
2. Confirmar Hyperdrive, Queues principal/DLQ, rate limiters, R2, Images e service binding.
3. Confirmar variáveis Supabase e Pusher sem imprimir valores.
4. Executar toda a matriz automatizada e os dois dry-runs.
5. Rodar `pnpm db:payment:preflight` com `DIRECT_URL` de staging.
6. Aplicar migrations com `pnpm db:deploy` somente após aprovação explícita.
7. Rodar `pnpm db:outbox:preflight` usando as credenciais do Hyperdrive.
8. Publicar primeiro o Worker de eventos e depois a aplicação da mesma revisão.
9. Manter `ORDER_EVENT_PUBLISH_MODE=direct` no primeiro smoke; promover para `dual` e `outbox`
   somente após observar Queue e polling saudáveis.
10. Executar smoke manual e E2E mutável na loja descartável.

Este documento não autoriza deploy. O workflow protegido continua sendo o caminho de publicação.

## Smoke manual

- Criar uma retirada e uma entrega com chaves de idempotência preservadas.
- Abrir o pedido simultaneamente no cliente e na Central.
- Avançar todas as etapas válidas e confirmar atualização automática e manual.
- Tentar uma ação com versão antiga e confirmar conflito sem histórico extra.
- Cancelar com motivo e confirmar mensagem pública sem nota interna.
- Interromper Pusher e confirmar polling em até 20 segundos.
- Confirmar que falha do evento deixa a operação salva e a outbox pendente.
- Verificar OWNER, MANAGER e ATTENDANT conforme a matriz de permissões.
- Trocar de loja e confirmar que fila, detalhes, busca e canais não vazam dados.
- Revisar modal/bottom sheet, foco, teclado, zoom e overflow em 320 px.

## Carga e consultas

Use os comandos documentados em `docs/testing.md`. O alvo deve conter 500 pedidos ativos e 10 mil
históricos. Registre o relatório JSON; não declare as metas atingidas sem essa evidência. Durante a
execução, monitore tempo do banco, CPU do Worker, memória, respostas 5xx, logs de consulta lenta,
backlog da Queue e conexões Hyperdrive.

## Observabilidade após staging

Durante a primeira janela operacional, acompanhar:

- `CONFLICT`, transições e confirmações financeiras rejeitadas;
- `SLOW_ORDER_QUERY` e `ABNORMAL_ACTIVE_ORDER_VOLUME`;
- eventos `PENDING`, `FAILED`, retries e DLQ da outbox;
- falhas de autenticação dos canais privados;
- desconexões Pusher e uso do polling;
- divergências detectadas pelo preflight financeiro;
- tempo até aceite, tempo de preparo e volume de pedidos criados.

Não registrar telefone, endereço, token público ou notas do cliente nos logs.

## Rollback

1. Pausar novas promoções e identificar se a falha é aplicação, consumer, banco ou integração.
2. Se o tempo real falhar, voltar `ORDER_EVENT_PUBLISH_MODE` para `direct`; preservar Queue, DLQ e
   outbox até drenar/reconciliar eventos.
3. Reverter aplicação e Worker de eventos para as versões anteriores registradas. Não executar
   rollback de produção a partir deste runbook.
4. Não remover colunas, tabelas, enums, triggers, índices ou dados durante o incidente. O runtime
   anterior deve usar a compatibilidade aditiva descrita nas migrations.
5. Para pagamento, seguir `docs/payment-lifecycle.md`; para realtime, seguir
   `docs/order-realtime-rollout.md`. Nunca corrigir Payment e Order silenciosamente por SQL ad hoc.
6. Se uma reversão de banco for inevitável, restaurar snapshot em uma nova instância, validar
   contagens/auditoria/outbox e promover somente após aprovação. Os blocos de rollback em SQL são
   referência manual, não comando automático.
7. Reexecutar preflights, testes, smoke e reconciliação antes de liberar tráfego.

Preservar sempre `AuditLog`, históricos, idempotency keys, counters, outbox e notas internas para
investigação e recuperação.
