import { logout } from '@/server/services/auth.service';
import { errorToResponse } from '@/server/errors';

/**
 * POST /api/auth/logout
 *
 * Revoga a sessão e remove o cookie.
 */
export async function POST() {
  try {
    await logout();

    return Response.json(
      { message: 'Logout realizado com sucesso.' },
      { status: 200 },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
