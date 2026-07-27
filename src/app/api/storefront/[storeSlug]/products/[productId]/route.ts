import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, NotFoundError, ValidationError } from '@/server/errors';
import { getPublicProductDetail, getPublicStoreScopeBySlug } from '@/server/queries/public-store';

const productDetailParamsSchema = z
  .object({
    storeSlug: slugSchema,
    // Produtos persistidos pelo seed usam GUIDs determinísticos sem os bits
    // de versão exigidos por z.uuid(). O banco e os demais fluxos do catálogo
    // aceitam o formato GUID completo, mantendo a validação estrutural estrita.
    productId: z.guid(),
  })
  .strict();

const securityHeaders = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

function errorResponse(error: unknown) {
  const response = errorToResponse(error);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ storeSlug: string; productId: string }>;
  },
) {
  try {
    const parsed = productDetailParamsSchema.safeParse(await params);
    if (!parsed.success) {
      throw new ValidationError('O produto informado é inválido.');
    }

    const store = await getPublicStoreScopeBySlug(parsed.data.storeSlug);
    if (!store) throw new NotFoundError('Produto');

    const product = await getPublicProductDetail(store.id, store.tenantId, parsed.data.productId);
    if (!product) throw new NotFoundError('Produto');

    return Response.json(
      { product },
      {
        headers: {
          ...securityHeaders,
          'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
