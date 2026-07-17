import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CustomizationEditor } from '@/components/admin/customization-editor';
import { createDefaultCustomization } from '@/features/customization/domain';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/features/customization/actions', () => ({
  saveCustomizationDraftAction: vi.fn(),
  discardCustomizationDraftAction: vi.fn(),
  publishCustomizationAction: vi.fn(),
  restoreCustomizationRevisionAction: vi.fn(),
  restoreDefaultCustomizationAction: vi.fn(),
}));

function renderEditor(hasDraft = false) {
  const config = createDefaultCustomization();
  return render(
    <CustomizationEditor
      tenantId="tenant-1"
      storeId="store-1"
      initialAssets={[]}
      initialBanners={[]}
      initialDomains={[]}
      initialEntitlement={{
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
      }}
      destinations={{ categories: [], products: [], coupons: [] }}
      storeSlug="loja-1"
      storeName="Loja de teste"
      storeStatus="OPEN"
      initialConfig={config}
      initialPublishedConfig={structuredClone(config)}
      initialDraftVersion={0}
      initialPublishedVersion={1}
      initialHasDraft={hasDraft}
      publishedAt="2026-07-17T12:00:00.000Z"
      revisions={[]}
    />,
  );
}

describe('CustomizationEditor', () => {
  it('expõe controles amigáveis sem editor manual de JSON', () => {
    renderEditor();

    expect(screen.getByRole('heading', { name: '1. Identidade' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Cores' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '3. Tipografia, tema e layout' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/json/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prévia responsiva' })).toBeInTheDocument();
  });

  it('marca alterações locais e habilita o salvamento de draft', () => {
    renderEditor();
    const saveButton = screen.getByRole('button', { name: 'Salvar rascunho' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Slogan'), { target: { value: 'Sabor local' } });

    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    expect(saveButton).toBeEnabled();
  });

  it('mantém a remoção da marca bloqueada sem entitlement', () => {
    renderEditor(true);

    expect(screen.getByLabelText('Exibir “Tecnologia por PedidoLocal”')).toBeDisabled();
  });
});
