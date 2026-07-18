import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultCustomization } from '@/features/customization/domain';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors';
import {
  getAdminCustomizationData,
  publishCustomization,
  restoreCustomizationRevision,
  restoreDefaultCustomization,
  saveCustomizationDraft,
} from '@/server/services/store-customization.service';

const mocks = vi.hoisted(() => ({
  requireSuperAdminStoreAccess: vi.fn(),
  ensureCustomization: vi.fn(),
  listRevisions: vi.fn(),
  listActiveStoreAssets: vi.fn(),
  findRevision: vi.fn(),
  getDb: vi.fn(),
  updateMany: vi.fn(),
  auditCreate: vi.fn(),
  revisionCreate: vi.fn(),
  assetFindMany: vi.fn(),
  listAdminStoreBanners: vi.fn(),
  listAdminStoreDomains: vi.fn(),
  findActiveStoreDomainByHostname: vi.fn(),
  ensureStoreEntitlement: vi.fn(),
  categoryFindMany: vi.fn(),
  productFindMany: vi.fn(),
  couponFindMany: vi.fn(),
}));

vi.mock('@/server/auth', () => ({
  requireSuperAdminStoreAccess: mocks.requireSuperAdminStoreAccess,
}));
vi.mock('@/server/repositories/store-customization.repository', () => ({
  ensureCustomization: mocks.ensureCustomization,
  listRevisions: mocks.listRevisions,
  findRevision: mocks.findRevision,
  jsonInput: (value: unknown) => value,
  normalizeDraftOrigin: (value: string | null) => value ?? 'SUPER_ADMIN_UI',
}));
vi.mock('@/server/repositories/store-asset.repository', () => ({
  listActiveStoreAssets: mocks.listActiveStoreAssets,
}));
vi.mock('@/server/repositories/store-banner.repository', () => ({
  listAdminStoreBanners: mocks.listAdminStoreBanners,
}));
vi.mock('@/server/repositories/store-domain.repository', () => ({
  listAdminStoreDomains: mocks.listAdminStoreDomains,
  findActiveStoreDomainByHostname: mocks.findActiveStoreDomainByHostname,
}));
vi.mock('@/server/repositories/store-entitlement.repository', () => ({
  ensureStoreEntitlement: mocks.ensureStoreEntitlement,
}));
vi.mock('@/server/database/client', () => ({ getDb: mocks.getDb }));

const config = createDefaultCustomization();
const context = {
  session: { userId: 'admin-1' },
  tenantId: 'tenant-1',
  storeId: 'store-1',
  store: {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: 'Loja 1',
    slug: 'loja-1',
    status: 'OPEN',
    isActive: true,
    tenant: { id: 'tenant-1', name: 'Tenant 1', status: 'ACTIVE' },
  },
};

function customization(overrides: Record<string, unknown> = {}) {
  return {
    id: 'customization-1',
    tenantId: 'tenant-1',
    storeId: 'store-1',
    schemaVersion: 1,
    publishedConfig: structuredClone(config),
    draftConfig: null,
    draftVersion: 2,
    publishedVersion: 1,
    publishedAt: new Date('2026-07-17T12:00:00Z'),
    publishedById: null,
    updatedById: null,
    draftOrigin: null,
    draftSourceRevisionId: null,
    createdAt: new Date('2026-07-17T12:00:00Z'),
    updatedAt: new Date('2026-07-17T12:00:00Z'),
    ...overrides,
  };
}

describe('StoreCustomizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminStoreAccess.mockResolvedValue(context);
    mocks.ensureCustomization.mockResolvedValue(customization());
    mocks.listRevisions.mockResolvedValue([]);
    mocks.listActiveStoreAssets.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: 'audit-1' });
    mocks.revisionCreate.mockResolvedValue({ id: 'revision-1' });
    mocks.assetFindMany.mockResolvedValue([]);
    mocks.listAdminStoreBanners.mockResolvedValue([]);
    mocks.listAdminStoreDomains.mockResolvedValue([]);
    mocks.findActiveStoreDomainByHostname.mockResolvedValue(null);
    mocks.ensureStoreEntitlement.mockResolvedValue({
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      maxAssetCount: 25,
      maxAssetStorageBytes: 50 * 1024 * 1024,
      maxBanners: 5,
      allowedLayoutTemplates: ['CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'],
      allowedVisualPresets: [
        'CLASSIC',
        'MODERN',
        'MINIMALIST',
        'BURGER',
        'PIZZA',
        'ACAI_DESSERT',
        'EXECUTIVE_RESTAURANT',
        'DARK_PREMIUM',
      ],
      advancedTypographyEnabled: true,
      customDomainEnabled: false,
      platformBrandingRemovalEnabled: false,
      scheduledBannersEnabled: false,
      createdAt: new Date('2026-07-17T12:00:00Z'),
      updatedAt: new Date('2026-07-17T12:00:00Z'),
    });
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.productFindMany.mockResolvedValue([]);
    mocks.couponFindMany.mockResolvedValue([]);

    const tx = {
      storeCustomization: { updateMany: mocks.updateMany },
      storeCustomizationRevision: { create: mocks.revisionCreate },
      auditLog: { create: mocks.auditCreate },
    };
    mocks.getDb.mockReturnValue({
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
      storeAsset: { findMany: mocks.assetFindMany },
      category: { findMany: mocks.categoryFindMany },
      product: { findMany: mocks.productFindMany },
      coupon: { findMany: mocks.couponFindMany },
    });
  });

  it('carrega somente configuração publicada, draft validado e histórico escopado', async () => {
    const draft = createDefaultCustomization();
    draft.identity.slogan = 'Rascunho';
    mocks.ensureCustomization.mockResolvedValue(customization({ draftConfig: draft }));

    const result = await getAdminCustomizationData('tenant-1', 'store-1');

    expect(result.customization.effectiveConfig.identity.slogan).toBe('Rascunho');
    expect(result.customization.hasDraft).toBe(true);
    expect(result.entitlement).toEqual({
      maxAssetCount: 25,
      maxAssetStorageBytes: 50 * 1024 * 1024,
      maxBanners: 5,
      allowedLayoutTemplates: ['CLASSIC_LIST', 'MODERN_GRID', 'EDITORIAL_HERO'],
      allowedVisualPresets: [
        'CLASSIC',
        'MODERN',
        'MINIMALIST',
        'BURGER',
        'PIZZA',
        'ACAI_DESSERT',
        'EXECUTIVE_RESTAURANT',
        'DARK_PREMIUM',
      ],
      advancedTypographyEnabled: true,
      customDomainEnabled: false,
      platformBrandingRemovalEnabled: false,
      scheduledBannersEnabled: false,
    });
    expect(result.entitlement).not.toHaveProperty('id');
    expect(result.entitlement).not.toHaveProperty('tenantId');
    expect(result.entitlement).not.toHaveProperty('createdAt');
    expect(mocks.listRevisions).toHaveBeenCalledWith('tenant-1', 'store-1');
  });

  it('salva draft com concorrência otimista, escopo e auditoria', async () => {
    const draft = createDefaultCustomization();
    draft.identity.slogan = 'Novo slogan';

    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: draft,
        expectedDraftVersion: 2,
      }),
    ).resolves.toMatchObject({ draftVersion: 3, changedSections: ['identity'] });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          storeId: 'store-1',
          draftVersion: 2,
        }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store-1',
        action: 'CUSTOMIZATION_DRAFT_SAVED',
        metadata: expect.objectContaining({ changedSections: ['identity'] }),
      }),
    });
  });

  it('rejeita asset ausente ou pertencente a outro tenant/store', async () => {
    const draft = createDefaultCustomization();
    const assetId = '4da03571-bffd-45ef-8c44-20686c487838';
    draft.identity.logoAssetId = assetId;

    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: draft,
        expectedDraftVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mocks.assetFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [assetId] },
        tenantId: 'tenant-1',
        storeId: 'store-1',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, assetType: true },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('valida imagens de categoria em duas consultas escopadas e sem N+1', async () => {
    const draft = createDefaultCustomization();
    const categoryId = '4da03571-bffd-45ef-8c44-20686c487838';
    const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';
    draft.categoryImages = [{ categoryId, assetId }];
    mocks.categoryFindMany.mockResolvedValue([{ id: categoryId }]);
    mocks.assetFindMany.mockResolvedValue([{ id: assetId, assetType: 'CATEGORY_IMAGE' }]);

    await saveCustomizationDraft('tenant-1', 'store-1', {
      config: draft,
      expectedDraftVersion: 2,
    });

    expect(mocks.categoryFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.categoryFindMany).toHaveBeenCalledWith({
      where: { id: { in: [categoryId] }, tenantId: 'tenant-1', storeId: 'store-1' },
      select: { id: true },
    });
    expect(mocks.assetFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.assetFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [assetId] },
        tenantId: 'tenant-1',
        storeId: 'store-1',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, assetType: true },
    });
  });

  it('rejeita referências de categoria ou asset fora do escopo e tipos incorretos', async () => {
    const draft = createDefaultCustomization();
    const categoryId = '4da03571-bffd-45ef-8c44-20686c487838';
    const assetId = 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1';
    draft.categoryImages = [{ categoryId, assetId }];
    mocks.categoryFindMany.mockResolvedValue([]);

    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: draft,
        expectedDraftVersion: 2,
      }),
    ).rejects.toThrow(
      'A personalização possui uma imagem de categoria inválida ou pertencente a outro estabelecimento.',
    );
    expect(mocks.updateMany).not.toHaveBeenCalled();

    mocks.categoryFindMany.mockResolvedValue([{ id: categoryId }]);
    mocks.assetFindMany.mockResolvedValue([{ id: assetId, assetType: 'LOGO' }]);
    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: draft,
        expectedDraftVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('preserva a origem de restauração ao editar o draft restaurado', async () => {
    mocks.ensureCustomization.mockResolvedValue(
      customization({
        draftConfig: config,
        draftOrigin: 'RESTORE',
        draftSourceRevisionId: 'revision-1',
      }),
    );

    await saveCustomizationDraft('tenant-1', 'store-1', {
      config,
      expectedDraftVersion: 2,
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          draftOrigin: 'RESTORE',
          draftSourceRevisionId: 'revision-1',
        }),
      }),
    );
  });

  it('rejeita versão obsoleta antes de abrir a transação', async () => {
    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config,
        expectedDraftVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('bloqueia publicação com contraste crítico', async () => {
    const inaccessible = createDefaultCustomization();
    inaccessible.palette.text = '#FFFFFF';
    inaccessible.palette.background = '#FFFFFF';
    mocks.ensureCustomization.mockResolvedValue(
      customization({ draftConfig: inaccessible, draftVersion: 4 }),
    );

    await expect(
      publishCustomization('tenant-1', 'store-1', {
        expectedDraftVersion: 4,
        reason: 'Atualização visual',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('bloqueia no servidor a remoção da marca sem entitlement', async () => {
    const withoutBranding = createDefaultCustomization();
    withoutBranding.platformBranding.showPedidoLocalBranding = false;

    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: withoutBranding,
        expectedDraftVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it('aceita remoção habilitada e audita a mudança somente na publicação', async () => {
    mocks.ensureStoreEntitlement.mockResolvedValue({
      ...(await mocks.ensureStoreEntitlement()),
      platformBrandingRemovalEnabled: true,
    });
    const draft = createDefaultCustomization();
    draft.platformBranding.showPedidoLocalBranding = false;
    mocks.ensureCustomization.mockResolvedValue(
      customization({ draftConfig: draft, draftVersion: 4, publishedVersion: 2 }),
    );

    await publishCustomization('tenant-1', 'store-1', {
      expectedDraftVersion: 4,
      reason: 'Plano permite white-label completo',
    });

    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BRANDING_VISIBILITY_CHANGED',
        metadata: expect.objectContaining({ previousVisible: true, nextVisible: false }),
      }),
    });
  });

  it('rejeita canonical externo que não pertence à loja', async () => {
    const draft = createDefaultCustomization();
    draft.seo.canonicalUrl = 'https://outra-loja.example/cardapio';

    await expect(
      saveCustomizationDraft('tenant-1', 'store-1', {
        config: draft,
        expectedDraftVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('publica em uma transação com revisão imutável e auditoria', async () => {
    const draft = createDefaultCustomization();
    draft.identity.slogan = 'Publicado';
    mocks.ensureCustomization.mockResolvedValue(
      customization({
        draftConfig: draft,
        draftVersion: 4,
        publishedVersion: 2,
        draftOrigin: 'RESTORE',
      }),
    );

    await expect(
      publishCustomization('tenant-1', 'store-1', {
        expectedDraftVersion: 4,
        reason: 'Publicar identidade revisada',
      }),
    ).resolves.toMatchObject({
      storeSlug: 'loja-1',
      draftVersion: 5,
      publishedVersion: 3,
    });

    expect(mocks.revisionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        storeId: 'store-1',
        version: 3,
        origin: 'RESTORE',
        reason: 'Publicar identidade revisada',
      }),
    });
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CUSTOMIZATION_PUBLISHED',
        metadata: expect.objectContaining({ nextVersion: 3, changedSections: ['identity'] }),
      }),
    });
  });

  it('restaura uma revisão escopada somente como novo draft', async () => {
    const snapshot = createDefaultCustomization();
    snapshot.identity.slogan = 'Versão anterior';
    mocks.findRevision.mockResolvedValue({
      id: 'revision-2',
      tenantId: 'tenant-1',
      storeId: 'store-1',
      version: 2,
      snapshot,
    });

    await expect(
      restoreCustomizationRevision('tenant-1', 'store-1', 'revision-2', {
        expectedDraftVersion: 2,
        reason: 'Revisar versão anterior',
      }),
    ).resolves.toEqual({ draftVersion: 3 });

    expect(mocks.findRevision).toHaveBeenCalledWith('tenant-1', 'store-1', 'revision-2');
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          draftOrigin: 'RESTORE',
          draftSourceRevisionId: 'revision-2',
        }),
      }),
    );
    expect(mocks.revisionCreate).not.toHaveBeenCalled();
  });

  it('não restaura revisão inexistente ou pertencente a outra loja', async () => {
    mocks.findRevision.mockResolvedValue(null);

    await expect(
      restoreCustomizationRevision('tenant-1', 'store-1', 'revision-from-store-2', {
        expectedDraftVersion: 2,
        reason: 'Tentar restaurar revisão',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('restaura o padrão somente como draft auditado', async () => {
    await expect(
      restoreDefaultCustomization('tenant-1', 'store-1', {
        expectedDraftVersion: 2,
        reason: 'Recomeçar a identidade visual',
      }),
    ).resolves.toEqual({ draftVersion: 3 });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ draftOrigin: 'SYSTEM_DEFAULT' }),
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CUSTOMIZATION_DEFAULT_RESTORED' }),
    });
  });
});
