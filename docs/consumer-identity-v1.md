# Identidade progressiva do consumidor + Clientes V1

## Estado da entrega

As migrations originais `20260824210000_consumer_identity_v1` e
`20260824210100_consumer_identity_search_indexes` já haviam sido aplicadas em 24/08/2026. A
migration aditiva `20260825120000_consumer_identity_email_verification` foi aplicada no banco de
staging autorizado em 25/08/2026 por `prisma migrate deploy`; a verificação posterior confirmou o
schema remoto atualizado.

O entitlement `consumerIdentityEnabled` continua sendo o único controle de Conta do cliente e
Clientes V1. Nenhum e-mail/SMS real, alteração DNS ou deploy de código fez parte desta operação. O
Worker `pedidolocal-staging` permanece com `CONSUMER_VERIFICATION_PROVIDER=disabled` enquanto a
marca e o domínio transacional são decididos.

## Arquitetura e responsabilidades

- `GUEST`: checkout visitante e histórico local continuam sem conta e sem e-mail.
- `RECOGNIZED`: telefone e cookie do aparelho agilizam uma nova compra, mas não autenticam.
- `VERIFIED`: e-mail ou telefone legado confirmado cria uma `ConsumerSession` própria do
  PedidoLocal em cookie HttpOnly por 90 dias.
- `Customer`: continua tenant-scoped, comercial e baseado no telefone do pedido.
- `ConsumerIdentity`: guarda somente credenciais verificadas globais; dados comerciais, endereços
  e pedidos permanecem no `Customer` do tenant.
- Resend: apenas entrega o e-mail. Não cria OTP, identidade, vínculo, autorização nem sessão.

Antes, toda `ConsumerIdentity` exigia telefone verificado e Bird/development controlavam o código.
Agora, telefone/`phoneVerifiedAt` permanecem opcionais para preservar identidades legadas e foram
adicionados `emailNormalized`/`emailVerifiedAt`. Resend e development usam OTP controlado pelo
PedidoLocal; Bird continua com OTP controlado pela API Verify.

## Modelo de confiança e safe claim

Verificar `pessoa@example.com` prova somente o controle desse e-mail. Isso nunca procura um
`Customer` por telefone, nome ou semelhança.

O primeiro vínculo exige um contexto forte resolvido no servidor:

1. `ORDER_CLAIM`: `publicToken` ativo, loja/tenant corretos, pedido com `customerId` exato e ação
   explícita “Guardar meus pedidos”; ou
2. `DEVICE_CLAIM`: reconhecimento válido do aparelho, loja/tenant corretos e Customer exato; ou
3. vínculo anterior: login por e-mail encontra a `ConsumerIdentity` já ligada.

O navegador nunca usa `customerId`, `consumerIdentityId` ou `tenantId` como autoridade. Login com
um e-mail novo pode criar identidade e sessão vazias, mas não dá acesso a Customer ou pedido antigo.
A resposta pública não revela se o e-mail já existia.

Quando um Customer já está ligado a uma identidade legada por telefone, um claim forte pode
adicionar o e-mail verificado à **mesma** identidade. Um e-mail já usado por outra identidade ou uma
tentativa de trocar silenciosamente o e-mail existente falha genericamente.

## Providers

```dotenv
CONSUMER_VERIFICATION_PROVIDER=disabled

# Bird legado/alternativo
BIRD_API_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL="PedidoLocal <acesso@updates.example.com>"
CONSUMER_VERIFICATION_OTP_SECRET=
```

Valores aceitos:

- `disabled`: padrão seguro; nenhuma confirmação é iniciada.
- `development`: somente development/test, e-mail sem entrega real e código fixo `000000`. Recusa
  qualquer runtime publicado.
- `bird`: Verify API regional atual, SMS e telefone E.164. Bird cria e confere o código.
- `resend`: envio transacional por e-mail. PedidoLocal cria e confere o código.

Todas as variáveis são server-only e não podem usar `NEXT_PUBLIC_`. `RESEND_API_KEY`,
`BIRD_API_KEY`, o segredo HMAC, OTPs, e-mails completos e tokens nunca entram em logs ou no bundle do
storefront.

## OTP de e-mail

- seis dígitos com `crypto.getRandomValues` e amostragem sem viés;
- HMAC-SHA-256 vinculado ao challenge opaco e assinado com
  `CONSUMER_VERIFICATION_OTP_SECRET` (mínimo 32 caracteres);
- somente o hash hexadecimal é persistido;
- expiração em 10 minutos;
- no máximo cinco tentativas;
- reenvio após 60 segundos com código/hash rotacionados;
- uso único e consumo protegido por transaction + advisory lock;
- challenge anterior do mesmo provider/loja/e-mail é cancelado após novo envio bem-sucedido;
- falha de entrega marca o challenge como `FAILED`, antes que qualquer token seja devolvido;
- dois submits simultâneos podem consumir no máximo uma vez.

O endpoint de confirmação recebe somente `challengeToken` opaco e `code`. O e-mail, tenant, loja,
Customer e prova de claim são recuperados server-side.

## Adaptador Resend

Foi escolhido REST `fetch` server-side, sem instalar o SDK. O runtime já oferece `fetch`, o payload é
pequeno e isso evita dependência e impacto desnecessário no bundle.

- endpoint: `POST https://api.resend.com/emails`;
- autenticação: `Authorization: Bearer RESEND_API_KEY`;
- conteúdo HTML e plain text;
- timeout de 10 segundos, sem retry automático;
- `Idempotency-Key` determinística por challenge/reenvio, sem PII;
- erros e `429` retornam mensagem humana e mantêm Guest/Recognized/checkout funcionando.

Segundo a documentação oficial, a chave de idempotência do `POST /emails` dura 24 horas e aceita até
256 caracteres. Referências: [Send Email](https://resend.com/docs/api-reference/emails/send-email),
[Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys),
[Domains](https://resend.com/docs/dashboard/domains/introduction) e
[Cloudflare](https://resend.com/docs/knowledge-base/cloudflare).

## Template transacional

Assunto: `Seu código de acesso — {StoreName}`.

O HTML é responsivo, sem imagem ou CSS avançado, e o código permanece texto selecionável de alto
contraste. A versão plain text contém o mesmo conteúdo:

```text
{StoreName}

Seu código é:

482193

Ele expira em 10 minutos.

Se você não solicitou esse acesso, ignore este e-mail.
```

Não inclui telefone, endereço, itens, valor ou histórico do pedido.

## Migration aditiva

`20260825120000_consumer_identity_email_verification`:

- torna o par de telefone da identidade opcional sem apagar os dados existentes;
- adiciona `emailNormalized` único e `emailVerifiedAt` à identidade;
- adiciona `emailNormalized` e `otpHash` ao challenge;
- torna o telefone do challenge opcional para login por e-mail;
- adiciona checks de formato/shape e índice de busca tenant/loja/e-mail;
- preserva sessões, vínculos, Customers, Orders, Addresses e challenges Bird existentes.

Ela foi aplicada em staging por `prisma migrate deploy` em 25/08/2026. Não usar `db push` remoto.

## Cache, privacidade e falha

Rotas de request, resend e verify usam `private, no-store`; o Service Worker ignora toda `/api/**` e
as páginas privadas. E-mail não vai para URL, query string, Pusher, analytics ou payload de fila.

Se Resend estiver indisponível, somente ativação/login Verified falha fechado. Cardápio, carrinho,
checkout sem e-mail, pedido, tracking e reconhecimento por telefone continuam funcionando. Dados
privados nunca fazem fail-open.

## Preparação manual da Resend

1. Criar ou escolher um subdomínio transacional, por exemplo `updates.seudominio.com`.
2. Adicionar o domínio na Resend.
3. Copiar os registros SPF e DKIM exibidos pela Resend para o DNS Cloudflare e aguardar `Verified`.
4. Opcionalmente configurar DMARC de forma gradual. Não é necessário habilitar recebimento ou
   webhook de bounce nesta V1.
5. Criar uma API key com permissão mínima de envio e, quando disponível, restrita ao domínio.
6. Gerar um segredo HMAC aleatório de pelo menos 32 caracteres.
7. Armazenar `RESEND_API_KEY` e `CONSUMER_VERIFICATION_OTP_SECRET` como secrets do Worker.
8. Configurar `RESEND_FROM_EMAIL` como var server-side usando exatamente o domínio verificado.
9. Alterar `CONSUMER_VERIFICATION_PROVIDER` para `resend` somente depois da migration e dos secrets.
10. Fazer smoke test numa loja piloto antes de ativar `consumerIdentityEnabled`.

Não automatizar DNS ou enviar e-mail real durante testes. O domínio `resend.dev` serve apenas para
testes controlados da própria Resend e não substitui o domínio de produção.

## Rollback funcional

Desligar `consumerIdentityEnabled` ou mudar o provider para `disabled`. Isso oculta Conta/Clientes e
bloqueia as rotas privadas sem apagar identidades, credenciais, sessões, vínculos, Customers,
endereços ou pedidos. Trocar `bird` por `resend` não invalida sessões já emitidas; challenge pendente
só pode ser concluído pelo mesmo provider que o iniciou.

## Riscos restantes

- entrega depende da reputação do domínio, SPF/DKIM e filtros do destinatário;
- conta de e-mail comprometida compromete a prova de controle enquanto não houver passkey;
- identidades legadas apenas por telefone precisam de um claim forte para receber uma credencial de
  e-mail; não existe backfill automático;
- bounces/webhooks, passkeys, recuperação forte e troca assistida de e-mail ficam fora da V1.
