# Combos e promoções

## Escopo da V1

A V1 oferece somente dois formatos explícitos:

- combo: dois ou mais produtos reais, com quantidades inteiras e um preço total especial;
- promoção de produto: substituição temporária do preço-base de um produto por um preço promocional.

Não há motor genérico de campanhas, segmentação, cron, preço dinâmico ou criação automática de ofertas.

## Entitlement e acesso

A capability canônica é `combosPromotions`, ligada a `StoreEntitlement.combosPromotionsEnabled`. O padrão é `false`.

- `OWNER` e `MANAGER` possuem `VIEW_OFFERS` e `MANAGE_OFFERS`;
- demais papéis não recebem acesso por padrão;
- navegação, páginas e ações verificam entitlement e permissão;
- a API de cotação ignora ofertas quando a capability está desligada.

Desligar o entitlement afeta somente novas cotações e compras. Pedidos históricos continuam usando seus snapshots.

## Agenda e timezone

Datas e horários são avaliados com `Store.timeZone`.

- início de data e horário é inclusivo;
- fim de data e horário é exclusivo;
- ausência de dias da semana significa todos os dias;
- uma janela que termina antes do início atravessa a meia-noite e pertence ao dia em que começou;
- a validade é calculada durante leitura e cotação, sem cron;
- a conversão usa `Intl` e foi testada em transições de DST.

Definições públicas podem permanecer em cache por até 60 segundos, mas o estado ativo é recalculado fora do cache em cada leitura. A cotação no servidor continua sendo a autoridade final.

## Pricing e stacking

O navegador envia intenção. Para produto, envia `productId`, opções, observação e quantidade. Para combo, envia `comboId`, quantidade e as opções/observações de cada componente.

A cotação canônica:

1. resolve produtos, opções, combo, promoção e cupom no escopo da loja;
2. calcula os itens pelo preço-base vigente e os adicionais pelos preços canônicos;
3. aplica ajustes automáticos de combo ou promoção;
4. aplica o cupom sobre a base de mercadorias após os ajustes automáticos;
5. adiciona taxa de entrega quando aplicável;
6. produz fingerprint com versões de produtos, opções, ofertas, cupom e contexto de entrega/salão.

Componentes de combo não recebem promoção de produto adicional. Adicionais mantêm seus preços. A taxa de entrega não recebe desconto automático nem cupom.

Todo dinheiro permanece em centavos inteiros. O total segue:

`subtotal - automaticDiscount - couponDiscount + deliveryFee = total`

## Conflitos e concorrência

Promoções sobrepostas para o mesmo produto são recusadas. Criação, alteração e reativação usam transação serializável, retry e advisory lock por loja/produto. Atualizações usam `version` para concorrência otimista.

## Persistência e snapshots

Na criação do pedido, a mesma transação persiste:

- `Order`;
- `OrderOfferGroup` para o snapshot comercial do combo;
- `OrderItem` reais para cada componente;
- `OrderItemOption` reais;
- `OrderPriceAdjustment` para combo, promoção e cupom;
- reserva/uso do cupom, pagamento, outbox e demais registros já existentes.

O grupo guarda nome, versão, quantidade, preço regular, preço ofertado, desconto e posição. Cada componente continua ligado ao produto real por snapshot de `OrderItem`, portanto alterações futuras na oferta não reprecificam pedidos antigos.

## Checkout e pagamentos

Checkout normal e salão convertem o carrinho para o mesmo contrato de intenção e requisitam a cotação canônica. A criação do pedido recalcula e valida o fingerprint antes de persistir.

`Payment.amount` e a criação do Pix usam `Order.total`. Promoções não alteram a reserva, consumo, liberação ou expiração de cupons; o registro de uso do cupom guarda somente a parcela do próprio cupom.

## DINE_IN, PICKUP e DELIVERY

- `DINE_IN`: componentes reais, ajustes automáticos e cupom; taxa de entrega igual a zero;
- `PICKUP`: mesma regra de pricing, sem taxa indevida;
- `DELIVERY`: mesma regra de pricing e taxa adicionada depois dos descontos sobre mercadorias.

## Central, KDS e relatórios

A Central exibe o agrupamento do combo e o ledger de ajustes separado por fonte. O KDS recebe os componentes reais e somente o nome do grupo necessário ao preparo, sem dados financeiros.

Relatórios continuam usando os `OrderItem` reais para ranking de produtos e o desconto agregado do pedido para totais financeiros. O ledger permite separar combo, promoção e cupom em análises futuras sem reinterpretar pedidos antigos.

## Multi-tenant e segurança

Todas as entidades carregam `tenantId` e `storeId`. Relações compostas, filtros de repositório, validação de serviço, constraints, RLS e revogação de acesso público impedem uso cruzado entre lojas. IDs enviados pelo cliente nunca autorizam preço ou desconto.

## Performance e cache

Ofertas e produtos são carregados em lote por loja; não existe consulta por produto. A vitrine usa imagens otimizadas e a lista administrativa é paginada. Alterações invalidam tags de ofertas e catálogo.

O PWA não é autoridade de preço. Mesmo com uma tela ou carrinho antigos, a próxima cotação no servidor revalida disponibilidade, agenda, versões e total.

## Rollout

1. revisar e aplicar a migration aditiva em ambiente controlado;
2. publicar a aplicação compatível com o entitlement desligado;
3. habilitar `Combos e promoções` loja a loja pelo Super Admin;
4. acompanhar erros de cotação, conflitos de versão e divergências de pagamento;
5. expandir gradualmente após validar Central, KDS e pagamentos de cada modalidade.

## Rollback

Definir `combosPromotionsEnabled=false` para a loja. Novas cotações deixam de aplicar e expor ofertas; pedidos já criados permanecem íntegros. Não remover tabelas nem reverter snapshots durante rollback funcional.

## Migration

A migration `20260821010000_combos_promotions_v1` é aditiva e cria enums, tabelas, relações, índices, constraints e políticas RLS. Ela não deve ser aplicada com `db push`, `migrate reset` ou diretamente em produção sem revisão.

