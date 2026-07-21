import { storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { requireActiveStoreContext } from '@/server/services/store-context.service';
import { errorToResponse, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { uploadStoreAssetAsTenantMember } from '@/server/services/store-asset.service';

const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

/**
 * Rota de upload de assets acessível a membros do tenant com permissão
 * MANAGE_PRODUCT_IMAGES (OWNER, MANAGER). Distinta da rota admin que exige
 * SUPER_ADMIN.
 */
export async function POST(request: Request) {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MULTIPART_BYTES) {
      throw new ValidationError('O upload excede o limite permitido.');
    }

    // Autoriza antes de materializar o multipart em memória
    const { session, store } = await requireActiveStoreContext(
      Permission.MANAGE_PRODUCT_IMAGES,
    );

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new ValidationError('Selecione um arquivo de imagem.');

    const metadata = storeAssetUploadMetadataSchema.safeParse({
      assetType: formData.get('assetType'),
      altText: formData.get('altText'),
      replaceAssetId: formData.get('replaceAssetId') || undefined,
    });
    if (!metadata.success) {
      throw new ValidationError(
        'Os metadados do asset são inválidos.',
        metadata.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }

    const asset = await uploadStoreAssetAsTenantMember(
      session.tenantId,
      store.id,
      file,
      metadata.data,
      session.userId,
    );
    return Response.json(
      { asset },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
