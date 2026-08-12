export const STORE_FEATURE_DEFINITIONS = {
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
    description: 'Alertas e acompanhamento de pedidos fora do prazo operacional.',
    entitlementField: 'operationalSlaEnabled',
    implementationStatus: 'COMING_SOON',
  },
  kds: {
    key: 'kds',
    label: 'KDS / Tela da cozinha',
    description: 'Tela dedicada ao preparo e à expedição dos pedidos.',
    entitlementField: 'kdsEnabled',
    implementationStatus: 'COMING_SOON',
  },
  advancedReports: {
    key: 'advancedReports',
    label: 'Relatórios avançados',
    description: 'Indicadores comerciais e operacionais aprofundados.',
    entitlementField: 'advancedReportsEnabled',
    implementationStatus: 'COMING_SOON',
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

type EntitlementFlags = Record<StoreFeatureEntitlementField, boolean>;

export function isStoreFeatureEntitled(
  entitlement: EntitlementFlags,
  feature: StoreFeatureKey,
): boolean {
  return entitlement[STORE_FEATURE_DEFINITIONS[feature].entitlementField];
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
