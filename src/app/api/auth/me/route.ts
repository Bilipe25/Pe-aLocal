import { requireAuthenticatedUser } from '@/server/auth';
import { errorToResponse } from '@/server/errors';

/**
 * GET /api/auth/me
 *
 * Retorna os dados do usuário autenticado.
 */
export async function GET() {
  try {
    const session = await requireAuthenticatedUser();

    return Response.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
      },
      role: session.role,
      tenantId: session.tenantId,
      storeId: session.storeId,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
