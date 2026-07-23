# Ciclo de pagamento dos pedidos

## Modelo operacional

Pedido e pagamento são estados independentes. Novos pedidos sempre começam com
`Order.status=PENDING` e `PaymentStatus=PENDING`; `AWAITING_PAYMENT` não faz parte
do fluxo operacional.

Transições autorizadas:

| Origem                   | Destino                  | Operação                                                           |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ |
| `PENDING`                | `CUSTOMER_REPORTED_PAID` | cliente informa Pix                                                |
| `PENDING`                | `PAID`                   | confirmação manual de Pix/dinheiro ou conclusão de dinheiro/cartão |
| `PENDING`                | `CANCELLED`              | cancelamento do pedido                                             |
| `CUSTOMER_REPORTED_PAID` | `PAID`                   | equipe confirma Pix                                                |
| `CUSTOMER_REPORTED_PAID` | `FAILED`                 | equipe não identifica o Pix                                        |
| `CUSTOMER_REPORTED_PAID` | `CANCELLED`              | cancelamento do pedido                                             |
| `FAILED`                 | `PENDING`                | equipe reabre a análise                                            |
| `FAILED`                 | `CANCELLED`              | cancelamento do pedido                                             |
| `PAID`                   | `REFUNDED`               | OWNER/MANAGER registra reembolso integral                          |

`CANCELLED` e `REFUNDED` são terminais. Cartão na entrega nunca possui
confirmação manual antecipada; a confirmação ocorre atomicamente ao concluir o
pedido. Esta fase registra um reembolso já realizado e não chama gateway ou
instituição financeira.

## Consistência

Toda mutação atualiza `Order.paymentStatus`, `Payment.status`, versão do pedido,
histórico financeiro imutável, AuditLog e outbox na mesma transação. O
constraint trigger diferido da migration `20260722172000_payment_consistency_guard`
valida no commit:

- existência do pagamento;
- igualdade de status;
- igualdade de método;
- igualdade entre `Payment.amount` e `Order.total`.

O trigger é diferido porque Order e Payment são atualizados por comandos SQL
separados dentro da mesma transação. Escritas unilaterais falham com SQLSTATE
`23514`.

As linhas do histórico não podem ser alteradas ou removidas diretamente durante
a vida do pedido. Exclusões do agregado completo seguem a política de retenção
existente e removem seus históricos por cascade.

## Rollout

1. Faça backup e confirme que `DIRECT_URL` aponta para o mesmo banco usado pelo Hyperdrive.
2. Execute `pnpm db:payment:preflight` em staging.
3. Investigue qualquer divergência; não escolha um status vencedor por regra
   automática. Use auditoria, `paidAt` e outbox como evidência.
4. Aplique a migration em staging.
5. Valide criação, Pix informado, confirmação, rejeição, reabertura, conclusão
   de dinheiro/cartão, reembolso e cancelamento após reembolso.
6. Monitore conflitos, SQLSTATE `23514`, falhas de outbox e tempo de transação.
7. Repita o preflight antes da janela autorizada de produção.

O rollout usa quatro migrations compatíveis com migration-first: o primeiro
expand adiciona os tokens com defaults necessários ao Worker anterior; o segundo
adiciona campos financeiros, histórico e o trigger de captura; backfill preserva
o melhor timestamp conhecido; consistency instala o trigger diferido. O writer novo grava o histórico antes de
alterar `Payment`, permitindo que o trigger de captura deduplique a transição pela
versão do pedido. Assim, mudanças concluídas por uma versão anterior durante o
deploy não abrem lacunas no histórico. O workflow manual executa o preflight
antes de `prisma migrate deploy`. Nenhuma migration deve ser aplicada
manualmente por `db push`.

Durante a compatibilidade, o trigger
`payments_populate_legacy_lifecycle_metadata` completa `cancelledAt` para
cancelamentos feitos pelo Worker anterior. Isso permite validar o contrato de
estados terminais sem bloquear requisições em voo.

O preflight também recusa o rollout se a migration substituída
`20260722170000_payment_lifecycle_consistency` aparecer como aplicada no ledger
do Prisma. Nesse caso, restaure o arquivo original e faça apenas migrations
aditivas posteriores; nunca altere o ledger ou reaplique o SQL.

O token da URL de acompanhamento é somente leitura. O relato Pix usa outro token
com propósito único, validade de sete dias e armazenamento em `sessionStorage`
no navegador que concluiu o checkout.

## Rollback

1. Remova os dois constraint triggers e a função de consistência antes de
   retornar a um código que deixe de realizar dual-write.
2. O código da Fase 6 permanece compatível com as novas colunas e seus defaults.
3. Remova apenas os `CHECK` que estiverem bloqueando o rollback.
4. Preserve as novas colunas durante a janela de rollback para não perder
   timestamps, motivos ou referência de reembolso.
5. Não apague AuditLog, outbox nem corrija dados financeiros silenciosamente.

Se apenas a aplicação falhar depois das migrations, a versão da Fase 6 pode ser
restaurada porque já realiza dual-write de status, método e valor. Faça rollback
separado da aplicação e do consumer de eventos; não reverta um componente que
continua saudável. Antes de voltar para qualquer versão anterior à Fase 6,
remova os triggers de consistência em uma migration explícita e monitore
divergências até o writer atual ser restaurado.

O trigger `payments_capture_legacy_status_history` deve ser preservado: além de
cobrir versões anteriores, ele cria o estado financeiro inicial dos novos
pedidos. As transições do writer atual continuam deduplicadas pela combinação
de pagamento, versão do pedido e status de destino.

O rollback dos triggers reabre o risco de divergência e exige monitoramento até
que a proteção seja restaurada.
