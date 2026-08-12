import { NextResponse } from 'next/server';

import { completeMercadoPagoOAuth } from '@/server/services/mercado-pago-connection.service';

export const dynamic = 'force-dynamic';

function safeFallback(request: Request, state: 'connected' | 'error') {
  return NextResponse.redirect(new URL(`/dashboard?connection=${state}`, request.url), 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  try {
    const result = await completeMercadoPagoOAuth(state, code);
    const response = NextResponse.redirect(
      new URL(`${result.returnPath}?connection=connected`, request.url),
      303,
    );
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch {
    const response = safeFallback(request, 'error');
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  }
}
