import { NextRequest } from 'next/server';
import { login } from '@/server/services/auth.service';
import { loginSchema } from '@/schemas/auth';
import { errorToResponse, ValidationError } from '@/server/errors';

/**
 * POST /api/auth/login
 *
 * Autentica o usuário e define o cookie de sessão.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse body
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorToResponse(new ValidationError('Corpo da requisição inválido.'));
    }

    // Validar
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return errorToResponse(
        new ValidationError(
          'Dados de login inválidos.',
          parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        ),
      );
    }

    // Obter IP e user agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const userAgent = request.headers.get('user-agent') ?? undefined;

    // Login
    const requestedRedirect =
      typeof body === 'object' && body !== null && 'redirect' in body
        ? String(body.redirect)
        : null;
    const result = await login(parsed.data, {
      ipAddress,
      userAgent,
      redirectTo: requestedRedirect,
    });

    return Response.json(
      {
        user: result.user,
        destination: result.destination,
      },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorToResponse(error);
  }
}
