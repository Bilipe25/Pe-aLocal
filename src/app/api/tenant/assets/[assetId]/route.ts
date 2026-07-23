import { z } from 'zod';

import { Permission } from '@/server/permissions';
import { errorToResponse } from '@/server/errors';
import * as assetRepo from '@/server/repositories/store-asset.repository';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { serveStoreAsset } from '@/server/storage/store-asset-response';

const assetIdSchema = z.uuid();

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId: rawAssetId } = await params;
    const assetId = assetIdSchema.safeParse(rawAssetId);
    if (!assetId.success) return new Response('Asset não encontrado.', { status: 404 });

    const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
    const asset = await assetRepo.findScopedStoreAsset(session.tenantId, store.id, assetId.data);
    if (
      !asset ||
      asset.status !== 'ACTIVE' ||
      asset.deletedAt !== null ||
      asset.assetType !== 'PRODUCT_IMAGE'
    ) {
      return new Response('Asset não encontrado.', { status: 404 });
    }

    return serveStoreAsset(request, asset, 'private, max-age=86400, immutable');
  } catch (error) {
    return errorToResponse(error);
  }
}
