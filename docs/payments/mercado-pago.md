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

`MERCADO_PAGO_CLIENT_ID` e `MERCADO_PAGO_REDIRECT_URI` são configurações públicas e podem ser declaradas como `vars` do Worker. `MERCADO_PAGO_CLIENT_SECRET`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY` são secrets; a chave de criptografia deve conter 32 bytes aleatórios codificados em base64. Secrets e tokens nunca devem ser gravados no repositório, logs ou respostas públicas.

As cinco configurações `MERCADO_PAGO_*`, além de `APP_ENV`, também precisam existir no Worker auxiliar `order-events`, porque ele processa a inbox de webhooks, renova tokens e executa a reconciliação periódica. No staging, as duas configurações públicas ficam versionadas em `wrangler.order-events.jsonc`; os três secrets permanecem armazenados exclusivamente no Cloudflare. Nesse Worker, use `MERCADO_PAGO_RECONCILIATION_ENABLED=true` somente no ambiente preparado. O kill switch de novas cobranças continua independente da reconciliação.

## OAuth em staging / sandbox

O ambiente do OAuth é determinado no servidor por `APP_ENV`; não existe flag `NEXT_PUBLIC` nem Access Token global compartilhado:

- `APP_ENV=development` ou `APP_ENV=staging`: a conta autorizadora deve ser um usuário Vendedor de teste, identificado pela tag oficial `test_user`;
- `APP_ENV=production`: a conta autorizadora deve ser real e não pode possuir a tag `test_user`.

A troca OAuth nunca envia `test_token`: a Orders API não aceita credenciais `TEST-`, inclusive no sandbox. Ela exige um Access Token OAuth `APP_USR-` emitido para o Vendedor de teste. Nem o prefixo `APP_USR-` nem o campo `live_mode` distinguem com segurança uma conta de teste de uma conta real nesse fluxo. Após a troca, o backend consulta o perfil oficial do vendedor em `api.mercadolibre.com`, exige que o ID corresponda ao `user_id` do token e usa somente a presença da tag `test_user` para aplicar a fronteira de ambiente. E-mail, nome e resposta bruta do perfil não são persistidos nem registrados.

O refresh segue o contrato oficial apenas com `client_id`, `client_secret`, `grant_type=refresh_token` e `refresh_token`; ele não envia `test_token`. Antes da rotação atômica, o backend revalida a compatibilidade `APP_USR-`, a identidade do vendedor e a tag `test_user` conforme `APP_ENV`. Uma conexão antiga com credencial `TEST-` é marcada como `REAUTH_REQUIRED` e precisa ser reconectada.

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
5. Confirme que o callback retorna ao staging e a conexão fica `ACTIVE`; `liveMode` é apenas metadado informativo e não define o sandbox.
6. Selecione `paymentMode=ONLINE`, gere um pedido Pix sandbox e valide webhook/reconciliação, Central e Merchant Push.
7. Execute o teste negativo: uma conta real, sem a tag `test_user`, deve ser rejeitada em staging e nunca deixar a conexão `ACTIVE`.

Nenhum pagamento real deve ser feito nesse smoke test.

### Promoção futura para produção

Antes de habilitar uma loja produtiva, configure `APP_ENV=production`, a redirect URI produtiva e o segredo de webhook produtivo. Confirme que a troca OAuth continua sem `test_token` e que contas marcadas como `test_user` são rejeitadas. Nunca reutilize o segredo de webhook de teste em produção.

Referências oficiais consultadas:

- [OAuth Authorization Code e PKCE](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation)
- [Renovação do Access Token](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/renewal)
- [Contas de teste](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts)
- [Consulta oficial de usuários e tag `test_user`](https://developers.mercadolivre.com.br/pt_br/servico-consulta-de-usuarios)

## Configuração no Mercado Pago

- Redirect URI canônica: `/api/integrations/mercado-pago/oauth/callback`.
- Webhook único: `/api/webhooks/mercado-pago`.
- Tópicos: `orders` e `mp-connect`.
- OAuth: PKCE S256, state de uso único e scopes `offline_access read write`.
- Hosts externos fixos: `auth.mercadopago.com`, `api.mercadopago.com` e `api.mercadolibre.com` apenas para validar a tag pública do vendedor.

## Ciclo do pedido

- O checkout online cria localmente `Order=AWAITING_PAYMENT`, `Payment=PENDING` e `MercadoPagoPayment=PENDING`.
- A chamada `POST /v1/orders` ocorre depois do commit, com valor calculado no servidor, `processing_mode=automatic`, Pix e uma idempotency key estável.
- Nenhum `ORDER_CREATED` operacional é emitido antes do pagamento.
- O webhook é validado por HMAC, persistido de forma idempotente e recebe `200` sem aguardar chamadas externas. O Worker confirma o estado com `GET /v1/orders/{id}` usando a credencial da conta conectada.
- Somente um pagamento integral e com valor exato promove o pedido para `PENDING`; essa transição grava históricos, auditoria e outbox na mesma transação.
- Falhas ambíguas mantêm o pedido em “Gerando seu Pix”. Antes de repetir o `POST`, o backend pesquisa a `external_reference`; conflitos `402/409/423`, timeout, `429` e `5xx` nunca geram uma nova idempotency key.
- O cron limita lote e concorrência, retoma criações ambíguas, consulta cobranças não finais, expira Pix vencidos e libera reservas de cupom.
- Cupons de pedidos online ficam reservados por tempo limitado e só incrementam `usageCount` quando o pagamento vira `PAID`.
- O ETA operacional nasce no instante da aprovação; enquanto o pedido estiver em `AWAITING_PAYMENT`, nenhuma promessa de entrega ou retirada é mostrada.
- Transições são monotônicas. `PAID` não regride, `REFUNDED` exige `PAID`, e aprovação tardia após cancelamento abre um alerta crítico em vez de alterar silenciosamente o pedido.
- Divergência de valor, status desconhecido, refund parcial e esgotamento de retentativas geram `PaymentProviderAlert` durável, sem payload bruto ou dados sensíveis.

## Operação e rollback

O rollback imediato é definir `MERCADO_PAGO_ENABLED=false`. Isso muda apenas novos checkouts para o fluxo manual. Não remova tabelas ou credenciais enquanto houver pagamentos pendentes: webhook, refresh e reconciliação precisam continuar ativos.

A migration é aditiva. A aplicação desta migration e a configuração de secrets em staging/produção são tarefas operacionais separadas; não use `db push` nem down migration para este rollout.
