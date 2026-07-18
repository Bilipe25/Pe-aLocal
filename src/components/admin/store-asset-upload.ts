import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';
import type { StoreAssetTypeValue } from '@/schemas/store-asset';

export async function uploadAdminStoreAsset(input: {
  tenantId: string;
  storeId: string;
  file: File;
  assetType: StoreAssetTypeValue;
  altText: string;
  replaceAssetId?: string | null;
}): Promise<AdminStoreAssetItem> {
  const formData = new FormData();
  formData.set('file', input.file);
  formData.set('assetType', input.assetType);
  formData.set('altText', input.altText);
  if (input.replaceAssetId) formData.set('replaceAssetId', input.replaceAssetId);

  const response = await fetch(
    `/api/admin/tenants/${encodeURIComponent(input.tenantId)}/stores/${encodeURIComponent(input.storeId)}/assets`,
    { method: 'POST', body: formData },
  );
  const body = (await response.json()) as {
    asset?: AdminStoreAssetItem;
    message?: string;
  };
  if (!response.ok || !body.asset) {
    throw new Error(body.message ?? 'Não foi possível enviar a imagem.');
  }
  return body.asset;
}
