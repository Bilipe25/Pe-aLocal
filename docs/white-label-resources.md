# Recursos white-label por loja

Esta fase adiciona banners, domínios em modo manual e limites de white-label.
Todas as operações administrativas exigem `platformRole = SUPER_ADMIN` e
confirmam no banco a relação entre `tenantId` e `storeId`.

## Banners

- Até cinco banners por loja por padrão, configurável no entitlement.
- No máximo três banners ativos com períodos sobrepostos.
- Agendamento só funciona quando `scheduledBannersEnabled` estiver ativo.
- Assets devem ser do tipo `BANNER`, estar ativos e pertencer à mesma loja.
- Categorias e produtos são validados pelo tenant e pela loja; cupons são
  validados pelo tenant.
- `INTERNAL_PATH` aceita somente caminhos iniciados pela rota da própria loja.

## Domínios manuais

O cadastro não cria DNS, certificado, Custom Hostname ou Cloudflare for SaaS.
Ele registra uma solicitação e um token de verificação para o procedimento
operacional:

1. Cadastre o hostname no painel do Super Admin.
2. Publique o token informado em um registro TXT no provedor DNS.
3. Valide DNS, certificado e roteamento fora da aplicação.
4. Marque manualmente o domínio como `VERIFYING`, `ACTIVE` ou `FAILED`.
5. Marque um único domínio `ACTIVE` como primário para gerar a canonical.

Domínios personalizados exigem `customDomainEnabled`. A rota atual
`/{storeSlug}` continua sendo o fallback oficial.

## Entitlements

Os limites cobrem apenas white-label: assets, armazenamento, banners, layouts,
presets, tipografia, domínio personalizado, remoção de marca e agendamento. As
configurações operacionais de pedido e pagamento permanecem em
`StoreSettings`.

Reduções são rejeitadas quando o uso atual ou uma configuração publicada/draft
ficaria inválida. Uploads e criação de banners bloqueiam a linha de entitlement
na transação para serializar operações concorrentes.

## Rollback

1. Reative `showPedidoLocalBranding` nas lojas que ocultaram a marca.
2. Desative banners e domínios primários.
3. Exporte `store_banners`, `store_domains` e `store_entitlements`.
4. Preserve os assets R2; eles não são removidos pela migration.
5. Remova as tabelas e enums conforme as instruções comentadas na migration.

Nunca remova valores antigos de `AuditAction`, pois logs históricos podem
referenciá-los.
