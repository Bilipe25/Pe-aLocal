import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware do Next.js.
 *
 * Responsabilidades:
 * 1. Headers de segurança (todas as rotas)
 * 2. Proteção de rotas /dashboard (requer cookie de sessão)
 * 3. Redirect de /login se já autenticado
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // =========================================================================
  // Headers de segurança (aplicados a todas as rotas)
  // =========================================================================
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  // =========================================================================
  // Proteção de rotas do dashboard
  // =========================================================================
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api/dashboard');

  if (isProtectedRoute) {
    const sessionCookie = request.cookies.get('pedidolocal_session');

    if (!sessionCookie?.value) {
      // Rotas de API retornam 401
      if (pathname.startsWith('/api/')) {
        return Response.json(
          {
            statusCode: 401,
            code: 'AUTHENTICATION_ERROR',
            message: 'Autenticação necessária.',
            details: [],
          },
          { status: 401 },
        );
      }

      // Rotas de página redirecionam para login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // =========================================================================
  // Redirect de /login se já autenticado
  // =========================================================================
  if (pathname === '/login') {
    const sessionCookie = request.cookies.get('pedidolocal_session');

    if (sessionCookie?.value) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
