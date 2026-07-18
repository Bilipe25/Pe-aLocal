import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreCategoryImagesManager } from '@/components/admin/store-category-images-manager';
import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';

const category = {
  id: '4da03571-bffd-45ef-8c44-20686c487838',
  name: 'Hambúrgueres',
  description: 'Hambúrgueres artesanais',
  sortOrder: 1,
  isActive: false,
};

const asset: AdminStoreAssetItem = {
  id: 'd665460d-b4be-48e6-8cb2-33ab2e5cc8a1',
  assetType: 'CATEGORY_IMAGE',
  mimeType: 'image/png',
  width: 800,
  height: 800,
  sizeBytes: 1024,
  altText: 'Hambúrguer artesanal',
  url: '/api/store-assets/asset',
  previewUrl: '/api/store-assets/asset?width=192',
  createdAt: '2026-07-17T12:00:00.000Z',
  deletedAt: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('StoreCategoryImagesManager', () => {
  it('altera o toggle e associa somente assets CATEGORY_IMAGE no rascunho', () => {
    const onShowImagesChange = vi.fn();
    const onAssociationsChange = vi.fn();
    render(
      <StoreCategoryImagesManager
        tenantId="tenant-1"
        storeId="store-1"
        categories={[category]}
        assets={[asset, { ...asset, id: 'logo', assetType: 'LOGO' }]}
        showImages={false}
        associations={[]}
        onShowImagesChange={onShowImagesChange}
        onAssociationsChange={onAssociationsChange}
        onAssetUploaded={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Exibir imagens das categorias no cardápio'));
    expect(onShowImagesChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Inativa')).toBeInTheDocument();

    const select = screen.getByLabelText('Selecionar imagem existente');
    expect(screen.queryByRole('option', { name: /logo/i })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: asset.id } });
    expect(onAssociationsChange).toHaveBeenCalledWith([
      { categoryId: category.id, assetId: asset.id },
    ]);
  });

  it('envia CATEGORY_IMAGE, atualiza a biblioteca e associa em memória', async () => {
    const onAssetUploaded = vi.fn();
    const onAssociationsChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ asset }),
      }),
    );
    render(
      <StoreCategoryImagesManager
        tenantId="tenant-1"
        storeId="store-1"
        categories={[{ ...category, isActive: true }]}
        assets={[]}
        showImages
        associations={[]}
        onShowImagesChange={vi.fn()}
        onAssociationsChange={onAssociationsChange}
        onAssetUploaded={onAssetUploaded}
      />,
    );

    fireEvent.change(screen.getByLabelText('Enviar nova imagem'), {
      target: { files: [new File(['png'], 'categoria.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar e associar' }));

    await waitFor(() => expect(onAssetUploaded).toHaveBeenCalledWith(asset));
    expect(onAssociationsChange).toHaveBeenCalledWith([
      { categoryId: category.id, assetId: asset.id },
    ]);
    expect(
      screen.getByText(/Imagem enviada e associada ao rascunho/),
    ).toBeInTheDocument();
  });

  it('indica e limpa associação órfã sem procurar outra loja', () => {
    const onAssociationsChange = vi.fn();
    render(
      <StoreCategoryImagesManager
        tenantId="tenant-1"
        storeId="store-1"
        categories={[]}
        assets={[asset]}
        showImages
        associations={[{ categoryId: category.id, assetId: asset.id }]}
        onShowImagesChange={vi.fn()}
        onAssociationsChange={onAssociationsChange}
        onAssetUploaded={vi.fn()}
      />,
    );

    expect(screen.getByText('Associações órfãs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar associação' }));
    expect(onAssociationsChange).toHaveBeenCalledWith([]);
  });
});
