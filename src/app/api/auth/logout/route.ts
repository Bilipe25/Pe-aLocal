import { logout } from '@/server/services/auth.service';
import { errorToResponse } from '@/server/errors';

/**
 * POST /api/auth/logout
 *
 * Revoga a sessão e remove o cookie.
 */
export async function POST(request?: Request) {
  try {
    await logout();

    if (request?.headers.get('accept')?.includes('text/html')) {
      return Response.redirect(new URL('/login', request.url), 303);
    }

    return Response.json(
      { message: 'Logout realizado com sucesso.' },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
