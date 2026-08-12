# Pix online por loja — Mercado Pago

## Escopo

O PedidoLocal mantém o pagamento manual como comportamento padrão. O Pix online usa a Orders API do Mercado Pago com uma conexão OAuth própria por estabelecimento; os valores são recebidos diretamente pela conta conectada da loja.

Uma nova cobrança online só é criada quando todas as condições abaixo forem verdadeiras:

1. `MERCADO_PAGO_ENABLED=true` no ambiente;
2. `StoreEntitlement.onlinePaymentsEnabled=true` para a loja;
3. `StoreSettings.paymentMode=ONLINE`;
4. a conexão Mercado Pago da loja está `ACTIVE`.

Se uma condição falhar, o checkout volta ao modo manual sem apagar a preferência, a conexão nem o histórico. Desligar o kill switch ou o entitlement bloqueia novas conexões e cobranças, mas webhooks e reconciliação de cobranças existentes continuam funcionando.

## Variáveis

```dotenv
APP_ENV=development
MERCADO_PAGO_ENABLED=false
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
MERCADO_PAGO_REDIRECT_URI=https://SEU_HOST/api/integrations/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY=
```

`MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY` deve ser uma chave aleatória de 32 bytes codificada em base64. Client secret, segredo do webhook, chave de criptografia e tokens nunca devem ser gravados no repositório, logs ou respostas públicas.

## OAuth em staging / sandbox

O ambiente do OAuth é determinado no servidor por `APP_ENV`; não existe flag `NEXT_PUBLIC` nem Access Token global compartilhado:

- `APP_ENV=development` ou `APP_ENV=staging`: a conta autorizadora deve ser um usuário Vendedor de teste e a resposta deve trazer `live_mode=false`;
- `APP_ENV=production`: a conta autorizadora é real e a resposta deve trazer `live_mode=true`.

A troca OAuth nunca envia `test_token`: a Orders API não aceita credenciais `TEST-`, inclusive no sandbox. Ela exige um Access Token OAuth `APP_USR-` emitido para o Vendedor de teste. O prefixo `APP_USR-` indica compatibilidade com a API, não diferencia sandbox de produção; essa separação é validada exclusivamente pelo `live_mode` retornado. `APP_ENV` ausente ou inválido impede a conexão. Se `live_mode` divergir do ambiente esperado, as credenciais retornadas não são criptografadas nem persistidas.

O refresh segue o contrato oficial apenas com `client_id`, `client_secret`, `grant_type=refresh_token` e `refresh_token`; ele não envia `test_token`. A resposta é revalidada contra `APP_ENV`, contra o `liveMode` persistido e quanto à compatibilidade `APP_USR-` antes da rotação atômica das credenciais. Uma conexão antiga com credencial `TEST-` é marcada como `REAUTH_REQUIRED` e precisa ser reconectada.

`MERCADO_PAGO_CLIENT_ID` e `MERCADO_PAGO_CLIENT_SECRET` continuam sendo as credenciais da aplicação OAuth. Não os substitua por Public Key, Access Token de teste, User ID ou credenciais de uma conta de teste. O PedidoLocal sempre recebe via OAuth um token próprio do vendedor que autorizou a aplicação.

### Configuração conceitual de staging

```dotenv
APP_ENV=staging
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_CLIENT_ID=<application-client-id>
MERCADO_PAGO_CLIENT_SECRET=<secret-configurado-fora-do-repositório>
MERCADO_PAGO_REDIRECT_URI=https://pedidolocal-staging.gabriellion97.workers.dev/api/integrations/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_SECRET=<segredo-do-webhook-de-teste>
MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY=<chave-base64-de-32-bytes>
```

Use uma conta de teste do tipo vendedor para representar o estabelecimento. Ela deve autorizar a aplicação PedidoLocal na tela OAuth. Não configure um `MERCADO_PAGO_TEST_ACCESS_TOKEN` global. O segredo de webhook de staging deve ser o segredo de teste, separado do segredo produtivo.

### Smoke test de staging

1. Configure staging como acima e mantenha produção inalterada.
2. Crie ou selecione uma conta de teste do tipo vendedor.
3. Habilite `onlinePaymentsEnabled` apenas para a loja de teste.
4. Como proprietário, clique em **Conectar Mercado Pago** e autentique a conta vendedor de teste.
5. Confirme que o callback retorna ao staging, a conexão fica `ACTIVE` e internamente possui `liveMode=false`.
6. Selecione `paymentMode=ONLINE`, gere um pedido Pix sandbox e valide webhook/reconciliação, Central e Merchant Push.
7. Execute o teste negativo: uma resposta OAuth com `live_mode=true` em staging deve ser rejeitada e nunca deixar a conexão `ACTIVE`.

Nenhum pagamento real deve ser feito nesse smoke test.

### Promoção futura para produção

Antes de habilitar uma loja produtiva, configure `APP_ENV=production`, a redirect URI produtiva e o segredo de webhook produtivo. Confirme que a troca OAuth continua sem `test_token` e que somente respostas com `live_mode=true` são aceitas. Nunca reutilize o segredo de webhook de teste em produção.

Referências oficiais consultadas:

- [OAuth Authorization Code e PKCE](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation)
- [Renovação do Access Token](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal)
- [Contas de teste](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts)

## Configuração no Mercado Pago

- Redirect URI canônica: `/api/integrations/mercado-pago/oauth/callback`.
- Webhook único: `/api/webhooks/mercado-pago`.
- Tópicos: `orders` e `mp-connect`.
- OAuth: PKCE S256, state de uso único e scopes `offline_access read write`.

## Ciclo do pedido

- O checkout online cria localmente `Order=AWAITING_PAYMENT`, `Payment=PENDING` e `MercadoPagoPayment=PENDING`.
- A chamada `POST /v1/orders` ocorre depois do commit, com valor calculado no servidor, `processing_mode=automatic`, Pix e uma idempotency key estável.
- Nenhum `ORDER_CREATED` operacional é emitido antes do pagamento.
- O webhook é validado por HMAC e o estado sempre é confirmado com `GET /v1/orders/{id}` usando a credencial da conta conectada.
- Somente um pagamento integral e com valor exato promove o pedido para `PENDING`; essa transição grava históricos, auditoria e outbox na mesma transação.
- Falhas ambíguas mantêm o pedido em “Gerando seu Pix”. Antes de repetir o `POST`, o backend pesquisa a `external_reference`; conflitos `402/409/423`, timeout, `429` e `5xx` nunca geram uma nova idempotency key.

## Operação e rollback

O rollback imediato é definir `MERCADO_PAGO_ENABLED=false`. Isso muda apenas novos checkouts para o fluxo manual. Não remova tabelas ou credenciais enquanto houver pagamentos pendentes: webhook, refresh e reconciliação precisam continuar ativos.

A migration é aditiva. A aplicação desta migration e a configuração de secrets em staging/produção são tarefas operacionais separadas; não use `db push` nem down migration para este rollout.
