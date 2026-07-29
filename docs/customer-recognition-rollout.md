# Reconhecimento rápido — migration, rollout e rollback

Este recurso é **reconhecimento não autenticado**. Ele não pode ser usado para
autorizar histórico, dados completos, comprovantes ou qualquer operação
sensível. O checkout visitante permanece disponível quando o reconhecimento
falha ou é bloqueado.

## Preparação e preflight

1. Confirme pelo Project Ref que `DIRECT_URL` e `DATABASE_URL` apontam para o
   ambiente explicitamente autorizado.
2. Faça backup lógico de `customers`, `customer_addresses` e `orders`.
3. Na versão anterior do schema, execute:

   ```text
   node tools/customer-recognition-preflight.mjs --before-migrate
   ```

   O gate bloqueia telefones brasileiros inválidos, telefones que colidem após
   normalização, endereços duplicados, mais de um endereço padrão e referências
   de pedido entre tenants. O relatório contém apenas contagens.

4. Resolva manualmente qualquer conflito. Não una clientes ou endereços por
   aproximação e não marque migrations como aplicadas sem conferir o banco.

## Ordem das migrations

Execute `pnpm db:deploy` somente em ambiente autorizado. A cadeia é separada
para limitar locks e permitir diagnóstico:

1. `20260729100000_customer_recognition_expand`: colunas aditivas, tabelas
   efêmeras, RLS e guards de escrita;
2. `20260729101000_customer_recognition_backfill`: valida e preenche telefones,
   tenant e fingerprints; ativa somente o conjunto legado seguro;
3. `20260729102000_customer_recognition_indexes`: índices concorrentes, fora de
   transação;
4. `20260729103000_customer_recognition_guard`: valida constraints, aplica
   `NOT NULL` e instala relações compostas;
5. `20260729120000_storefront_device_recognition`: cria o identificador opaco
   do aparelho, os vínculos isolados por tenant/loja e a referência opcional da
   sessão curta.

O fingerprint canônico é o SHA-256 hexadecimal do UTF-8 de
`street␟number␟complement␟neighborhood␟city␟state␟zipCode`. Cada parte textual
usa NFKD, remove marcas combinantes, converte para minúsculas, remove espaços
nas bordas e colapsa espaços internos. CEP contém somente dígitos. `label` e
`reference` não participam do fingerprint.

Após a migration, execute:

```text
node tools/customer-recognition-preflight.mjs
```

O preflight pós-migration também valida índices, constraints, isolamento por
tenant, RLS e ausência de grants diretos para `anon`/`authenticated`.

Os limites por IP e telefone são cumulativos entre todas as lojas do mesmo
tenant. O limite `STORE` permanece independente por estabelecimento. Na tabela
de throttle, escopos tenant-wide usam `storeId = NULL`; o escopo `STORE` exige
uma loja válida.

## Retenção operacional

Sessões, referências, throttles, vínculos de aparelho revogados/expirados e
aparelhos expirados sem vínculos deixam de ser aceitos imediatamente, mas nunca
são removidos durante uma requisição do checkout. Isso evita adicionar latência
e contenção ao caminho crítico do pedido. A rotina operacional usa os índices de
`expiresAt`, transações curtas, `FOR UPDATE SKIP LOCKED` e um lock consultivo
para impedir duas execuções simultâneas.

Execute primeiro no modo somente leitura, que é o padrão:

```text
pnpm db:customer-recognition:cleanup
```

O relatório mostra somente contagens agregadas elegíveis. Depois de conferir o
Project Ref e a janela operacional, autorize explicitamente a escrita:

```text
pnpm db:customer-recognition:cleanup -- --apply
```

A rotina exige `DIRECT_URL`; ela não usa `DATABASE_URL` como fallback. Por
padrão, preserva uma margem adicional de 60 minutos após a expiração, remove
até 500 linhas por transação e executa no máximo 20 lotes por tabela. Os limites
podem ser reduzidos ou ajustados dentro das guardas do script:

```text
pnpm db:customer-recognition:cleanup -- --apply --batch-size=250 --max-batches=10 --grace-minutes=120
```

Referências expiradas são removidas primeiro. Sessões expiradas são removidas
depois, com suas referências restantes por `ON DELETE CASCADE`; na sequência
são removidos throttles, vínculos de aparelho expirados/revogados e, por último,
aparelhos expirados sem vínculos. Se `batchLimitReached` for `true`, programe
outra execução em vez de aumentar o lote de forma agressiva. A saída nunca
inclui IDs, tokens, hashes, nome, telefone ou endereço.

Agende este comando fora do Worker e fora do fluxo HTTP, por exemplo em um job
operacional com credencial direta de staging/produção separada e de menor
privilégio possível. Comece com execução diária, observe duração, contagens e
contenção, e ajuste a frequência conforme o volume. Falha ou lock ocupado não
deve bloquear checkout nem deploy; o job pode ser repetido com segurança.

## Recuperação de falhas

- Se o backfill falhar, mantenha a aplicação anterior, corrija os registros
  conflitantes com revisão humana e execute novamente. Não faça merge automático.
- Se um índice concorrente falhar, consulte `pg_index.indisready` e
  `pg_index.indisvalid`. Remova apenas o índice inválido, use `prisma migrate
resolve` de acordo com o estado real e repita a etapa.
- Se o guard expirar por lock, mantenha a aplicação anterior e repita em uma
  janela de menor tráfego.
- Não habilite o frontend enquanto o preflight pós-migration estiver vermelho.

## Rollback

O rollback operacional preferido é republicar a aplicação anterior e manter o
schema aditivo. A versão anterior ignora as novas tabelas e colunas, enquanto os
pedidos e consentimentos já persistidos permanecem preservados. A versão
imediatamente anterior do PedidoLocal não criava nem atualizava `Customer` ou
`CustomerAddress`; uma versão antiga que faça essas escritas não é compatível
com as novas colunas obrigatórias e não deve ser usada como rollback.

O arquivo
`prisma/migrations/20260729100000_customer_recognition_expand/rollback.sql` é
manual e destrutivo. Ele só pode ser usado depois de:

1. interromper todas as escritas;
2. exportar clientes, endereços, referências e mapeamentos de zona novos;
3. confirmar que nenhuma versão nova está ativa;
4. confirmar que não existem pedidos de entrega estruturados sem CEP.

O rollback destrutivo remove sessões e referências, restaura a FK anterior de
endereços e volta a exigir CEP no constraint legado. Ele nunca deve ser chamado
por `prisma migrate deploy`, `db push` ou `migrate reset`.

Para a etapa de aparelho, o rollback operacional também é republicar a versão
anterior e manter as tabelas aditivas. O arquivo manual
`prisma/migrations/20260729120000_storefront_device_recognition/rollback.sql`
só remove a referência das sessões e as duas tabelas depois de exportar os
consentimentos persistidos e interromper todas as escritas.

Nenhuma destas etapas autoriza deploy de produção.
