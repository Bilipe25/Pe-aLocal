import { storeAssetUploadMetadataSchema } from '@/schemas/store-asset';
import { requireSuperAdminStoreAccess } from '@/server/auth';
import { errorToResponse, ValidationError } from '@/server/errors';
import { uploadStoreAsset } from '@/server/services/store-asset.service';

const MAX_MULTIPART_BYTES = 6 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string; storeId: string }> },
) {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_MULTIPART_BYTES) {
      throw new ValidationError('O upload excede o limite permitido.');
    }

    const { tenantId, storeId } = await params;
    // Autorize antes de materializar o multipart em memória. O serviço repete
    // a validação para continuar seguro quando chamado fora desta rota.
    await requireSuperAdminStoreAccess(tenantId, storeId);
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

    const asset = await uploadStoreAsset(tenantId, storeId, file, metadata.data);
    return Response.json(
      { asset },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
