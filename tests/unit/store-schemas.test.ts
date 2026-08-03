import { describe, expect, it } from 'vitest';

import {
  updateAddressSchema,
  updateStoreSchema,
  updateStoreOperationalSettingsSchema,
  updateStorePaymentSettingsSchema,
  updateStorefrontDisplaySchema,
} from '@/schemas/store';

describe('schemas de configuracao da loja', () => {
  it('normaliza dados gerais antes de persistir', () => {
    const parsed = updateStoreSchema.parse({
      name: ' Burger do Ze ',
      slug: 'burger-do-ze',
      description: '  Hamburguers artesanais  ',
      phone: '(85) 99999-9999',
      whatsapp: '+55 (85) 98888-7777',
    });

    expect(parsed).toMatchObject({
      name: 'Burger do Ze',
      description: 'Hamburguers artesanais',
      phone: '5585999999999',
      whatsapp: '5585988887777',
    });
  });

  it('mantem modalidades e prazo estruturado consistentes sem aceitar pagamentos', () => {
    expect(
      updateStoreOperationalSettingsSchema.parse({
        minOrderValue: '20',
        estimatedTimeMinMinutes: '30',
        estimatedTimeMaxMinutes: '50',
        deliveryEnabled: 'false',
        pickupEnabled: 'true',
      }),
    ).toMatchObject({
      minOrderValue: 20,
      estimatedTimeMinMinutes: 30,
      estimatedTimeMaxMinutes: 50,
      deliveryEnabled: false,
      pickupEnabled: true,
    });

    const invalidOperations = updateStoreOperationalSettingsSchema.safeParse({
      minOrderValue: '20',
      estimatedTimeMinMinutes: '50',
      estimatedTimeMaxMinutes: '30',
      deliveryEnabled: 'false',
      pickupEnabled: 'false',
    });

    expect(invalidOperations.success).toBe(false);
    expect(invalidOperations.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['estimatedTimeMaxMinutes', 'deliveryEnabled']),
    );

    expect(
      updateStoreOperationalSettingsSchema.safeParse({
        minOrderValue: '20',
        estimatedTimeMinMinutes: '30',
        estimatedTimeMaxMinutes: '50',
        deliveryEnabled: 'true',
        pickupEnabled: 'true',
        acceptsPix: 'true',
      }).success,
    ).toBe(false);
  });

  it('valida pagamentos em contrato separado e salva nova chave Pix normalizada', () => {
    const parsed = updateStorePaymentSettingsSchema.parse({
      acceptsPix: 'true',
      acceptsCash: 'false',
      acceptsCardOnDelivery: 'false',
      replacePixKey: 'true',
      pixKeyType: 'PHONE',
      pixKey: '(85) 99999-9999',
      pixRecipient: 'PedidoLocal LTDA',
      pixBank: 'Banco Teste',
      pixInstructions: 'Enviar comprovante.',
    });

    expect(parsed.pixKey).toBe('+5585999999999');

    const invalid = updateStorePaymentSettingsSchema.safeParse({
      acceptsPix: 'true',
      acceptsCash: 'false',
      acceptsCardOnDelivery: 'false',
      replacePixKey: 'true',
      pixKeyType: 'EMAIL',
      pixKey: 'email-invalido',
      pixRecipient: '',
    });

    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues.map((issue) => issue.path.join('.'))).toEqual(
      expect.arrayContaining(['pixKey', 'pixRecipient']),
    );

    expect(
      updateStorePaymentSettingsSchema.safeParse({
        acceptsPix: 'false',
        acceptsCash: 'false',
        acceptsCardOnDelivery: 'false',
      }).success,
    ).toBe(false);
  });

  it('normaliza endereco e rejeita UF ou CEP invalidos', () => {
    expect(
      updateAddressSchema.parse({
        street: 'Rua A',
        number: '123',
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: ' ce ',
        zipCode: '60.000-000',
      }),
    ).toMatchObject({ state: 'CE', zipCode: '60000000' });

    expect(
      updateAddressSchema.safeParse({
        street: 'Rua A',
        number: '123',
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'ZZ',
        zipCode: '123',
      }).success,
    ).toBe(false);
  });

  it('aceita somente os sete booleanos de exibição pública', () => {
    expect(
      updateStorefrontDisplaySchema.parse({
        showEstimatedTimeInHero: 'true',
        showFulfillmentInHero: 'false',
        showMinOrderValueInHero: 'true',
        showOpeningHoursInHero: 'false',
        showFullAddressInStoreInfo: 'false',
        showRecentPurchasesSection: 'true',
        showFeaturedProductsSection: 'false',
      }),
    ).toEqual({
      showEstimatedTimeInHero: true,
      showFulfillmentInHero: false,
      showMinOrderValueInHero: true,
      showOpeningHoursInHero: false,
      showFullAddressInStoreInfo: false,
      showRecentPurchasesSection: true,
      showFeaturedProductsSection: false,
    });

    expect(
      updateStorefrontDisplaySchema.safeParse({
        showEstimatedTimeInHero: true,
        showFulfillmentInHero: false,
        showMinOrderValueInHero: true,
        showOpeningHoursInHero: false,
        showFullAddressInStoreInfo: false,
        showRecentPurchasesSection: true,
        showFeaturedProductsSection: true,
        tenantId: 'tenant-injetado',
      }).success,
    ).toBe(false);

    expect(
      updateStorefrontDisplaySchema.safeParse({
        showEstimatedTimeInHero: true,
        showFulfillmentInHero: false,
        showMinOrderValueInHero: true,
        showOpeningHoursInHero: false,
        showFullAddressInStoreInfo: false,
        showRecentPurchasesSection: 'talvez',
        showFeaturedProductsSection: true,
      }).success,
    ).toBe(false);
  });
});
