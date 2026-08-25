# Identidade progressiva do consumidor + Clientes V1

## Estado desta entrega

O código foi preparado e, em 24/08/2026, as migrations `20260824210000_consumer_identity_v1` e `20260824210100_consumer_identity_search_indexes` foram aplicadas com sucesso ao banco configurado. O entitlement `consumerIdentityEnabled` permanece desligado. Nenhum SMS real ou deploy da aplicação foi executado nessa operação.

## Modelo de confiança

- `GUEST`: checkout visitante e histórico local continuam funcionando.
- `RECOGNIZED`: o aparelho conhecido apenas facilita o preenchimento; não é autenticação.
- `VERIFIED`: o telefone foi confirmado pelo provedor e a sessão fica em cookie HttpOnly por 90 dias.

Confirmar um telefone não reivindica automaticamente um `Customer`. O vínculo exige uma prova forte e explícita: `publicToken` ativo de um pedido com Customer compatível, reconhecimento ativo do aparelho ou um vínculo anterior. Não existe backfill de clientes antigos.

## Provedor de confirmação

Variáveis do servidor:

```dotenv
CONSUMER_VERIFICATION_PROVIDER=disabled
BIRD_API_KEY=
```

Valores aceitos para o provider:

- `disabled`: padrão seguro; nenhuma confirmação é iniciada.
- `development`: somente `next dev`/testes, com código determinístico `000000`. O adaptador se recusa a operar em runtime publicado.
- `bird`: usa a Verify API regional atual da Bird, somente por SMS, com seis dígitos. O PedidoLocal limita cada challenge a cinco minutos, cinco tentativas e reenvio após 60 segundos.

Não use prefixo `NEXT_PUBLIC_` nessas variáveis. O código OTP, a chave Bird, tokens de sessão, telefone e endereços não podem aparecer em logs.

### API Bird escolhida

Para novos projetos, o PedidoLocal usa a geração atual documentada pela Bird:

- `POST /v1/verify/verifications` para criar ou reenviar;
- `POST /v1/verify/verifications/check` para conferir o código;
- `Authorization: Bearer BIRD_API_KEY`;
- host regional derivado da própria chave `bk_{região}_...`;
- destinatário E.164 como identificador da verificação, sem guardar `verificationId`.

A geração anterior usava `api.bird.com/workspaces/{workspaceId}/verify`, `Authorization: AccessKey`, Navigator e um `verificationId`. Ela continua documentada para integrações existentes, mas não é a opção adotada pelo PedidoLocal. `BIRD_ACCESS_KEY`, `BIRD_WORKSPACE_ID` e `BIRD_VERIFY_NAVIGATOR_ID` não são mais lidas pelo código.

Referências oficiais: [visão geral da Verify](https://bird.com/en-us/docs/guides/verify/overview), [envio e conferência](https://bird.com/en-us/docs/guides/verify/sending-verifications), [autenticação e API keys](https://bird.com/en-us/docs/guides/authentication) e [hosts regionais](https://bird.com/en-us/docs/api/regions).

### Configuração Bird obrigatória antes do rollout

A API atual mantém duração, tentativas e cooldown na configuração do workspace. Antes de ativar uma loja em produção, confirmar no painel Bird:

- Duration: 5 minutos;
- Maximum Retries: 5;
- Retry Delay: 60 segundos;
- país Brasil habilitado;
- SMS habilitado para o Brasil;
- API key regional com somente o escopo `verify:write`.

O provider também envia `options.code_length=6` e `options.channels=["sms"]`. Mesmo que a configuração remota esteja divergente, o PedidoLocal falha fechado após cinco minutos ou cinco tentativas e mantém seus próprios limites por telefone, IP e loja. Respostas `429` da Bird são respeitadas e nunca provocam retry automático ou novo SMS silencioso.

## Rollout

1. Fazer backup e executar os preflights de integridade de Order/Customer.
2. Revisar e aplicar `20260824210000_consumer_identity_v1`.
3. Aplicar isoladamente `20260824210100_consumer_identity_search_indexes`, pois usa `CREATE INDEX CONCURRENTLY`.
4. Configurar a Verify atual no ambiente piloto com duração de 5 minutos, 5 tentativas, cooldown de 60 segundos e somente SMS.
5. Criar uma API key regional com escopo mínimo `verify:write` e armazená-la como secret `BIRD_API_KEY`.
6. Alterar `CONSUMER_VERIFICATION_PROVIDER` para `bird` e publicar.
7. Ativar `consumerIdentityEnabled` somente em uma loja piloto pelo Super Admin.
8. Validar login, claim pós-pedido, checkout visitante, checkout autenticado, endereços, Clientes e PDV.
9. Expandir gradualmente.

O backend bloqueia a ativação do entitlement em runtime publicado quando o provider não está pronto.

## Rollback funcional

Desligue `consumerIdentityEnabled` ou volte o provider para `disabled`. Isso oculta Conta e Clientes e bloqueia as rotas privadas, sem apagar identidades, sessões, vínculos, Customers, endereços ou pedidos. Não remova tabelas durante um rollback operacional.

## Privacidade e retenção

Rotas de OTP, conta, endereços e pedidos autenticados usam `private, no-store`. O Service Worker trata `/account/**` como sensível. A identidade global guarda apenas telefone normalizado e data de verificação; nome, contato comercial, endereços e pedidos continuam no Customer tenant-scoped. Sessões podem ser revogadas e expiram em 90 dias.

Risco residual conhecido: autenticação somente por telefone não detecta a reciclagem pela operadora de um número que já estava vinculado. Passkeys e recuperação forte são evoluções posteriores.
