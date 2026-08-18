# Multi-tenancy

O tenant é derivado da sessão em rotas privadas e de recursos públicos já resolvidos no servidor em fluxos públicos. `tenantId`, `storeId` e IDs internos enviados pelo navegador nunca são fonte de autorização.

## Regras

- Modelos privados carregam `tenantId`; relações críticas usam FKs compostas com loja e pedido.
- Repositórios e serviços filtram tenant/loja antes de ler ou alterar recursos.
- Tabelas privadas usam RLS habilitado e revogam acesso direto de `anon` e `authenticated`; o runtime acessa PostgreSQL pela conexão de servidor.
- Assets white-label precisam pertencer simultaneamente ao tenant e à loja e estar ativos.
- Domínios customizados só são aceitos quando há `StoreDomain` ativo da mesma loja.
- Tokens públicos são opacos, expiram e autorizam somente o contrato público específico; reconhecimento de dispositivo nunca é autorização.

No Web Push, a inscrição é global por origem+navegador, mas cada vínculo com pedido carrega tenant/loja/pedido e possui FK composta. O endpoint nunca determina tenant. Projeções e deliveries copiam o escopo exclusivamente do `OrderOutboxEvent` persistido.

Para operadores, `StoreStaffPushSubscription` usa FKs compostas para membership e loja. Usuário, membership, tenant, loja, permissões e inscrição são revalidados antes de cada envio. Uma inscrição física pode acompanhar várias lojas do mesmo usuário, mas somente um usuário administrativo fica ativo por dispositivo; trocar o usuário desabilita os vínculos administrativos anteriores sem tocar nos vínculos do consumidor.

Alerts e deliveries do SLA copiam tenant, loja e pedido do candidato persistido e usam FKs compostas. Antes do envio, o Worker exige que o alert, o pedido, o entitlement e a associação administrativa continuem no mesmo escopo. Uma associação de outra loja ou tenant nunca participa do fan-out.

O snapshot do KDS deriva tenant e loja da sessão e da loja ativa, exige entitlement e permissões,
e filtra ambos os campos em todas as consultas. Seu DTO exclui cliente, contato, endereço e
pagamento. A autorização do canal realtime continua vinculada à mesma loja ativa.
