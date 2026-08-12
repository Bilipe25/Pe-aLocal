import { NextResponse } from 'next/server';

import type { MercadoPagoConnectionFeedback } from '@/lib/mercado-pago/oauth-feedback';
import {
  completeMercadoPagoOAuth,
  MercadoPagoOAuthCompletionError,
} from '@/server/services/mercado-pago-connection.service';

export const dynamic = 'force-dynamic';

function redirectWithFeedback(
  request: Request,
  returnPath: string,
  feedback: MercadoPagoConnectionFeedback,
) {
  const destination = new URL(returnPath, request.url);
  destination.searchParams.set('connection', feedback);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  try {
    const result = await completeMercadoPagoOAuth(state, code);
    return redirectWithFeedback(request, result.returnPath, 'connected');
  } catch (error) {
    if (error instanceof MercadoPagoOAuthCompletionError) {
      return redirectWithFeedback(request, error.returnPath, error.reason);
    }
    console.error('[MP_OAUTH_CALLBACK_FAILED]', {
      reason: 'precondition_error',
      hasState: Boolean(state),
      hasCode: Boolean(code),
    });
    return redirectWithFeedback(request, '/dashboard', 'error');
  }
}
