import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

const LEGACY_COOKIE = 'pedidolocal_session';

// OpenNext 1.x ainda não empacota o Proxy Node.js do Next 16. Esta convenção
// legada mantém a execução Edge compatível até o adaptador suportar Node Middleware.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/dashboard') ||
    pathname.startsWith('/api/admin');

  let response: NextResponse;
  let isAuthenticated = false;

  try {
    ({ response, isAuthenticated } = await updateSession(request));
  } catch {
    response = NextResponse.next({ request });
  }

  // O cookie legado nunca concede acesso após a ativação do Supabase Auth.
  if (request.cookies.has(LEGACY_COOKIE)) {
    response.cookies.set(LEGACY_COOKIE, '', {
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  if (isProtectedRoute && !isAuthenticated) {
    if (pathname.startsWith('/api/')) {
      return Response.json(
        {
          statusCode: 401,
          code: 'AUTHENTICATION_ERROR',
          message: 'Autenticação necessária.',
          details: [],
        },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  const isPublicOrderTracking = /^\/[^/]+\/order\/[^/]+\/?$/.test(pathname);
  response.headers.set(
    'Referrer-Policy',
    isPublicOrderTracking ? 'no-referrer' : 'strict-origin-when-cross-origin',
  );
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
