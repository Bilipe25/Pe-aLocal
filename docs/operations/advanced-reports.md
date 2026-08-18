# Relatórios avançados V2

## Escopo e acesso

A rota canônica é `/dashboard/reports`. Não existe uma implementação paralela de V2.

O acesso exige, em conjunto:

- `StoreEntitlement.advancedReportsEnabled` ativo para a loja;
- permissão canônica `VIEW_REPORTS` no papel atual;
- contexto autenticado com `tenantId` e `storeId` válidos.

Na versão atual, somente `OWNER` recebe `VIEW_REPORTS`. A página e cada Server Action repetem as verificações antes de consultar dados. Toda agregação ancora o intervalo em `tenantId`, `storeId` e `operationalStartedAt`.

## Definições comerciais

As métricas avançadas não reutilizam silenciosamente as regras mais amplas dos cards simples do dashboard.

- **Pedidos:** pedidos cujo `operationalStartedAt` pertence ao período. Pedidos que nunca entraram em operação, inclusive `AWAITING_PAYMENT`, não entram.
- **Valor em pedidos concluídos:** soma inteira de `Order.total`, em centavos, somente quando o estado atual é `DELIVERED` e `paymentStatus` é `PAID`.
- **Ticket médio:** valor concluído dividido pela quantidade de pedidos `DELIVERED` e `PAID`.
- **Cancelamentos:** pedidos operacionais do período cujo estado atual é `CANCELLED`.
- **Produtos:** soma de `OrderItem.quantity` somente em pedidos `DELIVERED` e `PAID`, agrupada por `productId`. O nome é o snapshot mais recente, priorizando o período atual. Valor por produto não é exibido porque descontos e entrega não têm rateio comercial definido.
- **Tempo para aceitar:** média de `acceptedAt - operationalStartedAt`; registros sem ambos os timestamps ou com duração negativa não entram.
- **Tempo de preparo:** média de `readyAt - preparingAt`; registros sem ambos os timestamps ou com duração negativa não entram.
- **Pedidos em Atenção:** quantidade distinta de pedidos com registro real em `OrderOperationalSlaAlert`. **Crítico** também conta pedidos distintos. Se SLA estiver desligado, o bloco não é retornado.

## Períodos e comparação

Os limites são calculados na timezone da loja e convertidos para instantes UTC antes da consulta.

- **Hoje:** da meia-noite local até agora; compara o mesmo tempo decorrido de ontem.
- **7 dias e 30 dias:** começam na meia-noite local do primeiro dia e terminam agora; comparam um intervalo imediatamente anterior de duração idêntica.
- **Personalizado:** inclui dias locais completos, aceita no máximo 365 dias e compara os mesmos números de dias imediatamente anteriores.

A série usa hora para um dia, dia até 14 dias e semana acima de 14 dias. Comparações contra zero são descritas como **Sem base anterior**, nunca como crescimento infinito.

## Motor determinístico

O motor está em `src/domain/reports/advanced-report-insights.ts`. Não usa modelo de linguagem, causalidade, previsão ou dados pessoais. Cada insight carrega categoria, prioridade, tom, métrica de evidência, valores comparados e tamanho da amostra. No máximo três são exibidos.

Limites centralizados atuais:

| Regra                         |      Limite |
| ----------------------------- | ----------: |
| Amostra mínima geral          |   5 pedidos |
| Mudança comercial relevante   |          8% |
| Base mínima de produto        |  5 unidades |
| Mudança absoluta de produto   |  3 unidades |
| Mudança percentual de produto |         15% |
| Janela horária                | 5 registros |
| Mudança no aceite             | 30 segundos |
| Mudança no preparo            | 60 segundos |
| Mudança operacional relativa  |         15% |
| Modalidade dominante          |         65% |
| Concentração no pico          |         25% |
| Insights visíveis             |           3 |

A ordem é estável: gargalo operacional, mudança comercial, movimento de produto, composição por modalidade e pico horário. Empates usam identificadores estáveis.

Movimentos percentuais de produto exigem base anterior válida. Um produto sem base anterior só aparece como **Novo no período** ao alcançar a quantidade mínima. O ranking e as tendências não incluem receita por item.

## Privacidade e dados adiados

O DTO agregado não contém nome de cliente, telefone, endereço, notas ou identificador de cliente. As consultas não projetam esses campos.

Recorrência de clientes permanece adiada porque `customerId` é opcional e sua cobertura ainda não é comprovada. Combinações frequentes de itens também permanecem adiadas até existir benchmark específico que demonstre custo aceitável e uma regra clara para complementos e variações.

## Performance e migração

Não há cache compartilhado, biblioteca de gráficos, warehouse ou migration nesta entrega (`Migration: NONE`). As consultas são agregadas, parametrizadas e executadas em paralelo no servidor. O gráfico é SVG/HTML acessível e traz tabela equivalente.

O benchmark obrigatório está em `tools/reports-query-benchmark.mjs`. Ele:

- exige confirmação explícita de staging e valida o Project Ref da conexão;
- abre `BEGIN READ ONLY`;
- executa `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`;
- mede execução no banco e round-trip separadamente;
- registra índices, tipos de nó, blocos e sequential scans;
- cobre resumo, série semanal, tendências de produtos, durações, distribuição horária, gargalo por hora, modalidades e SLA distinto.

Execute somente em staging:

```powershell
$env:REPORTS_PERF_ACKNOWLEDGE_STAGING='true'
$env:REPORTS_PERF_PROJECT_REF='<project-ref-staging>'
$env:REPORTS_PERF_STORE_ID='<store-id-staging>'
pnpm perf:reports:queries
```

O orçamento padrão é p95 de 750 ms por agregação em uma janela de até 365 dias. Uma migration de índice só deve ser proposta a partir do plano e dos tempos medidos no volume real de staging.

## Estados e observabilidade

A interface oferece carregamento, vazio, amostra insuficiente, erro inicial e falha de atualização sem apagar os dados anteriores. O período e a metodologia permanecem visíveis. Tendências são sempre identificadas como histórico, não previsão.

Falhas preservam os códigos sanitizados da Server Action. Logs do servidor devem manter somente IDs internos de tenant/loja e contexto técnico; não registrar o DTO completo nem dados de pedido.
