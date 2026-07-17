import type { StoreEntitlement } from '@prisma/client';

import type { StoreCustomizationConfig } from '@/schemas/customization';
import { ValidationError } from '@/server/errors';
import { CUSTOMIZATION_PRESETS } from '@/features/customization/domain/presets';

type CustomizationEntitlement = Pick<
  StoreEntitlement,
  | 'allowedLayoutTemplates'
  | 'allowedVisualPresets'
  | 'advancedTypographyEnabled'
  | 'platformBrandingRemovalEnabled'
>;

export function assertCustomizationEntitlement(
  config: StoreCustomizationConfig,
  entitlement: CustomizationEntitlement,
) {
  if (!entitlement.allowedLayoutTemplates.includes(config.theme.layoutTemplate)) {
    throw new ValidationError('O layout selecionado não está habilitado para esta loja.');
  }
  if (!entitlement.allowedVisualPresets.includes(config.theme.visualPreset)) {
    throw new ValidationError('O preset selecionado não está habilitado para esta loja.');
  }
  if (
    !entitlement.advancedTypographyEnabled &&
    JSON.stringify(config.typography) !==
      JSON.stringify(CUSTOMIZATION_PRESETS[config.theme.visualPreset].typography)
  ) {
    throw new ValidationError('A tipografia avançada não está habilitada para esta loja.');
  }
  if (
    !config.platformBranding.showPedidoLocalBranding &&
    !entitlement.platformBrandingRemovalEnabled
  ) {
    throw new ValidationError('A remoção da marca PedidoLocal não está habilitada para esta loja.');
  }
}
