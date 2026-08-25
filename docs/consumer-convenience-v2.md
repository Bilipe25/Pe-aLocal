# Identidade Progressiva V2 + Clientes V2

## Objetivo

A V2 mantém a compra visitante como caminho principal e usa a identidade por e-mail apenas como
atalho opcional para continuidade entre aparelhos, recompra e relacionamento simples da loja.

- `Guest` continua navegando, favoritando localmente, comprando, pagando e acompanhando sem conta.
- `Recognized` continua sendo reconhecimento conveniente por telefone/aparelho, nunca autenticação.
- `Verified` usa e-mail confirmado, sessão HttpOnly e autorização resolvida no servidor.
- `Customer` continua sendo o perfil comercial por tenant; `ConsumerIdentity` continua sendo a
  identidade autenticável global mínima.

## Entitlement e rollout

`consumerConvenienceV2Enabled` controla somente as conveniências novas e nasce `false`. Ele exige
`consumerIdentityEnabled=true`. Com a V2 desligada, a Identidade Progressiva V1, checkout,
reconhecimento, Pedidos e Clientes V1 continuam funcionando.

As migrations aditivas são:

1. `20260825150000_consumer_convenience_v2`: flag, sessões, favoritos e troca de e-mail;
2. `20260825150100_consumer_convenience_v2_indexes`: índices concorrentes.

Elas não fazem backfill, não removem dados e não devem ser substituídas por `prisma db push`. As duas
migrations foram aplicadas em staging em 25/08/2026 com `prisma migrate deploy`; a verificação
posterior confirmou o schema atualizado no projeto Supabase `wxkvajjupvvfwyfgxacb`.

Próximas etapas do rollout: validar provider Resend → habilitar uma loja piloto → smoke tests
Guest/Recognized/Verified → observar → expandir. Rollback funcional:
desligar `consumerConvenienceV2Enabled`; nenhum favorito, vínculo, pedido ou endereço é apagado.

## Favoritos

Guest persiste somente IDs públicos em `localStorage`, sempre por `storeId`. Produto indisponível,
esgotado ou arquivado não apaga o favorito. Após login, a união `local + servidor` é idempotente e
nunca usa lista local vazia como ordem para apagar o servidor. Toda mutação autenticada deriva
identidade, tenant e loja da sessão/slug e valida o produto pela FK composta.

Respostas usam `private, no-store`; falha de sincronização nunca impede catálogo, carrinho ou pedido.

## Recompra determinística

O motor considera no máximo 50 pedidos dos últimos 12 meses, somente `DELIVERED + PAID`, na loja e
no Customer autorizados. A assinatura usa produto, quantidade e opções ordenadas; observações livres
não participam. “Seu de sempre” exige três composições iguais. “Pedido frequente” exige duas e exibe
no máximo duas alternativas.

Antes de mostrar um atalho, o PedidoLocal reconstrói o pedido com catálogo, disponibilidade, opções e
preços atuais. Composição de oferta/combo que não pode ser reconstruída com segurança é ocultada ou
vai para revisão; preço e promoção históricos nunca viram autoridade.

## Sessões e aparelhos

- token aleatório de 32 bytes; somente SHA-256 no banco;
- cookie HttpOnly, SameSite Lax e Secure em runtime publicado;
- validade fixa de 30 dias;
- no máximo cinco sessões ativas por identidade;
- rótulo genérico derivado do User-Agent, sem fingerprint invasivo;
- `lastUsedAt` atualizado no máximo uma vez por dia;
- “Sair dos outros” preserva a sessão atual e é idempotente;
- nenhum token é retornado pela listagem de aparelhos.

A limpeza operacional é dry-run por padrão:

```bash
pnpm db:consumer-identity:cleanup
pnpm db:consumer-identity:cleanup -- --apply
```

O job remove em lotes challenges expirados há 7 dias e sessões/requisições encerradas há 30 dias.
Agendar somente após revisão operacional separada.

## Troca segura de e-mail

Uma sessão válida inicia a alteração, mas o valor só muda depois do OTP de seis dígitos enviado ao
novo endereço. O PedidoLocal mantém HMAC, expiração, cinco tentativas, uso único e rate limiting. A
confirmação usa advisory lock, compara o hash do e-mail atual (CAS), recusa conflito com outra
identidade sem merge automático, rotaciona a sessão atual e revoga as demais.

Resend continua sendo apenas transporte. Nenhum OTP, e-mail, bearer token ou chave entra em logs,
URLs, cache público, Service Worker ou browser storage.

## Clientes V2 e PDV

Clientes permanece disponível apenas a Owner/Manager com `VIEW_CUSTOMER_CONTACT`, sempre na loja
ativa. As compras elegíveis são `DELIVERED + PAID`. “Voltaram este mês” significa Customer com compra
elegível no mês atual da loja e pelo menos uma compra elegível anterior. Perfil mostra somente fatos:
mais pedido e composição repetida; não chama comportamento inferido de “favorito”.

O PDV permanece Customer-based e tablet-first. Atendente recebe nome, telefone operacional,
classificação, compras, último pedido, endereços usados na loja e “mais pedido”. Nunca recebe e-mail
autenticável, `ConsumerIdentity`, OTP ou sessões.

## Privacidade e falhas

Todas as rotas privadas são same-origin, corpo máximo de 4 KiB, resposta `private, no-store` e não
aceitam `tenantId`, `customerId` ou `consumerIdentityId` como autoridade do browser. Falhas de Resend,
favoritos ou personalização degradam apenas o atalho: o pedido visitante continua disponível.

Risco residual documentado: quem controla um e-mail já vinculado consegue autenticar. Recuperação
forte/passkeys e gestão avançada de conta continuam fora desta V2.
