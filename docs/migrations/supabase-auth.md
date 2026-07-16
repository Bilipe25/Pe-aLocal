# Migração para Supabase Auth

## Modelo de identidade

`auth.users.id` é armazenado em `users.authUserId` (único e inicialmente anulável). O `users.id` atual foi preservado para evitar reescrever chaves estrangeiras. A tabela `users` contém apenas perfil de negócio; toda autorização de tenant continua em `tenant_members`.

`user_metadata` é usado apenas para dados de apresentação durante criação administrativa. Roles e permissões nunca são lidas desse campo. A fonte de verdade é a membership ativa, junto com `users.isActive` e `tenants.status = ACTIVE`.

## Migração de usuários

1. Faça backup verificado do PostgreSQL antes de aplicar migrations.
2. Aplique `20260715133000_supabase_auth_bridge`, que adiciona `authUserId` e torna o hash anulável sem apagar dados.
3. Para desenvolvimento, execute o seed com senhas temporárias fornecidas somente por variáveis de ambiente. O seed cria as identidades pelo Admin API e salva apenas o UUID.
4. Para usuários reais, crie contas por convite/recuperação no Supabase e associe os UUIDs. O primeiro login autenticado também pode associar com segurança um perfil legado ainda sem UUID quando o e-mail verificado coincide.
5. Valide login, logout, refresh, recuperação, memberships, tenant suspenso e auditoria em staging.
6. Mantenha uma janela de rollback. Só depois dela crie outra migration para apagar `passwordHash` e `sessions`.

Hashes Argon2 nunca são enviados ao Supabase Auth.

## Configuração Supabase

- Site URL: domínio de staging durante a validação; depois domínio de produção.
- Redirect URLs: `https://<staging>/auth/callback`, `https://<production>/auth/callback` e URLs locais necessárias.
- Fluxo SSR: PKCE, cookies `SameSite=Lax`, `Secure` em produção.
- JWT: prefira chave assimétrica para que `getClaims()` valide por JWKS com cache.
- Publishable key pode ir ao navegador; secret key/service role é exclusiva do servidor.

## RLS e Data API

A migration `20260715140000_enable_rls_defense_in_depth` habilita RLS e revoga `anon`/`authenticated` em todas as tabelas da aplicação. Isso é intencional: o navegador não usa a Data API para dados de negócio; Prisma + Hyperdrive é a única via.

Não há policies permissivas `TO authenticated`, pois isso seria autenticação sem autorização e abriria BOLA/IDOR. Se uma tabela for exposta futuramente, crie policies por ownership/membership com `USING` e `WITH CHECK`, teste UPDATE com policy SELECT e rode os advisors do Supabase antes do deploy.

## Checklist de segurança

- `middleware.ts` faz apenas refresh/redirect; autorização final ocorre no servidor.
- `getClaims()` valida a identidade; operações que exigirem estado de usuário mais recente podem usar `getUser()`.
- Perfil ausente ou sem membership não recebe role implícita.
- `requireStoreAccess()` consulta `store.tenantId` no banco.
- Tenant suspenso, membership inativa ou usuário inativo não obtêm contexto administrativo.
- Cookies `pedidolocal_session` são expirados e nunca autorizam acesso.
- Respostas Auth são `private, no-store`.

## Rollback

A migration ponte inclui instruções de rollback antes da associação de identidades. Depois que `authUserId` estiver preenchido, não remova a coluna sem exportar o mapeamento. A reversão de runtime deve restaurar uma versão anterior do Worker; a reversão de banco é uma operação separada, precedida de backup e autorização.
