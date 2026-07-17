import { describe, expect, it } from 'vitest';

import {
  createDefaultCustomization,
  migrateCustomizationToCurrentVersion,
} from '@/features/customization/domain';
import {
  storeCustomizationConfigSchema,
  storeCustomizationConfigV1Schema,
} from '@/schemas/customization';

describe('schema v2 da personalização', () => {
  it('migra v1 preservando todos os campos e sem alterar a origem', () => {
    const current = createDefaultCustomization();
    const { categoryImages: _categoryImages, ...withoutAssociations } = current;
    const { showCategoryImages: _showCategoryImages, ...legacyLayout } = current.layout;
    const legacy = {
      ...withoutAssociations,
      schemaVersion: 1 as const,
      identity: { ...current.identity, slogan: 'Configuração histórica' },
      layout: legacyLayout,
    };
    const snapshot = structuredClone(legacy);

    expect(storeCustomizationConfigV1Schema.safeParse(legacy).success).toBe(true);
    expect(migrateCustomizationToCurrentVersion(legacy)).toEqual({
      ...legacy,
      schemaVersion: 2,
      layout: { ...legacy.layout, showCategoryImages: false },
      categoryImages: [],
    });
    expect(legacy).toEqual(snapshot);
  });

  it('gera v2 com imagens desativadas e associações vazias', () => {
    const config = createDefaultCustomization();

    expect(config.schemaVersion).toBe(2);
    expect(config.layout.showCategoryImages).toBe(false);
    expect(config.categoryImages).toEqual([]);
  });

  it('rejeita categoria duplicada, IDs inválidos e mais de 100 associações', () => {
    const categoryId = '4da03571-bffd-45ef-8c44-20686c487838';
    const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';
    const duplicate = createDefaultCustomization();
    duplicate.categoryImages = [
      { categoryId, assetId },
      { categoryId, assetId: '6c5a2835-c3c9-4b70-9ba5-8ccf748b31fd' },
    ];
    expect(storeCustomizationConfigSchema.safeParse(duplicate).success).toBe(false);

    const invalid = createDefaultCustomization();
    invalid.categoryImages = [{ categoryId: 'categoria', assetId }];
    expect(storeCustomizationConfigSchema.safeParse(invalid).success).toBe(false);

    const tooMany = createDefaultCustomization();
    tooMany.categoryImages = Array.from({ length: 101 }, (_, index) => ({
      categoryId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      assetId,
    }));
    expect(storeCustomizationConfigSchema.safeParse(tooMany).success).toBe(false);
  });

  it('preserva associações quando a exibição global é desativada', () => {
    const config = createDefaultCustomization();
    config.layout.showCategoryImages = true;
    config.categoryImages = [
      {
        categoryId: '4da03571-bffd-45ef-8c44-20686c487838',
        assetId: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
      },
    ];
    config.layout.showCategoryImages = false;

    expect(storeCustomizationConfigSchema.parse(config).categoryImages).toEqual(
      config.categoryImages,
    );
  });
});
