export const STORE_FEATURE_DEFINITIONS = {
  consumerConvenienceV2: {
    key: 'consumerConvenienceV2',
    label: 'Recompra e conveniência V2',
    description: 'Sincroniza favoritos, mostra o de sempre e permite gerenciar aparelhos.',
    entitlementField: 'consumerConvenienceV2Enabled',
    implementationStatus: 'AVAILABLE',
  },
  consumerIdentity: {
    key: 'consumerIdentity',
    label: 'Conta do cliente e Clientes',
    description: 'Ativa acesso verificado, histórico em outros aparelhos e Clientes V1.',
    entitlementField: 'consumerIdentityEnabled',
    implementationStatus: 'AVAILABLE',
  },
  pos: {
    key: 'pos',
    label: 'PDV / Balcão',
    description:
      'Permite que a equipe registre pedidos de entrega, retirada e salão diretamente pelo PedidoLocal.',
    entitlementField: 'posEnabled',
    implementationStatus: 'AVAILABLE',
  },
  dineInQr: {
    key: 'dineInQr',
    label: 'Pedido por QR Code no salão',
    description: 'Permite cadastrar mesas e receber pedidos presenciais pelo cardápio da loja.',
    entitlementField: 'dineInQrEnabled',
    implementationStatus: 'AVAILABLE',
  },
  onlinePayments: {
    key: 'onlinePayments',
    label: 'Pagamento online',
    description: 'Pix com confirmação automática pela conta Mercado Pago da loja.',
    entitlementField: 'onlinePaymentsEnabled',
    implementationStatus: 'AVAILABLE',
  },
  operationalSla: {
    key: 'operationalSla',
    label: 'Pedido não atendido / SLA operacional',
    description: 'Destaca e reforça pedidos que estão demorando para ser aceitos.',
    entitlementField: 'operationalSlaEnabled',
    implementationStatus: 'AVAILABLE',
  },
  kds: {
    key: 'kds',
    label: 'KDS / Tela da cozinha',
    description: 'Organiza o preparo da cozinha em tempo real, do aceite ao pedido pronto.',
    entitlementField: 'kdsEnabled',
    implementationStatus: 'AVAILABLE',
  },
  advancedReports: {
    key: 'advancedReports',
    label: 'Relatórios avançados',
    description: 'Indicadores comerciais e operacionais aprofundados.',
    entitlementField: 'advancedReportsEnabled',
    implementationStatus: 'AVAILABLE',
  },
  combosPromotions: {
    key: 'combosPromotions',
    label: 'Combos e promoções',
    description: 'Crie combos com preço especial e promoções simples para produtos.',
    entitlementField: 'combosPromotionsEnabled',
    implementationStatus: 'AVAILABLE',
  },
  orderPrinting: {
    key: 'orderPrinting',
    label: 'Impressão / comandas',
    description: 'Impressão automática e manual de pedidos e comandas.',
    entitlementField: 'orderPrintingEnabled',
    implementationStatus: 'COMING_SOON',
  },
} as const;

export type StoreFeatureKey = keyof typeof STORE_FEATURE_DEFINITIONS;
export type StoreFeatureDefinition = (typeof STORE_FEATURE_DEFINITIONS)[StoreFeatureKey];
export type StoreFeatureEntitlementField = StoreFeatureDefinition['entitlementField'];

type EntitlementFlags = Partial<Record<StoreFeatureEntitlementField, boolean>>;

export function isStoreFeatureEntitled(
  entitlement: EntitlementFlags,
  feature: StoreFeatureKey,
): boolean {
  return entitlement[STORE_FEATURE_DEFINITIONS[feature].entitlementField] === true;
}

export function isStoreFeatureAvailable(
  entitlement: EntitlementFlags,
  feature: StoreFeatureKey,
): boolean {
  const definition = STORE_FEATURE_DEFINITIONS[feature];
  return (
    definition.implementationStatus === 'AVAILABLE' && isStoreFeatureEntitled(entitlement, feature)
  );
}
