import { logout } from '@/server/services/auth.service';
import { errorToResponse } from '@/server/errors';
import { requireAuthenticatedUser } from '@/server/auth';
import {
  clearMerchantPushDeviceCookie,
  disableStoreStaffPushSubscriptionsForLogout,
  getMerchantPushDeviceCookie,
} from '@/server/services/store-staff-push-subscription.service';
import { z } from 'zod';

const deviceIdSchema = z.string().uuid();

/**
 * POST /api/auth/logout
 *
 * Revoga a sessão e remove o cookie.
 */
export async function POST(request?: Request) {
  try {
    let session: Awaited<ReturnType<typeof requireAuthenticatedUser>> | null = null;
    try {
      session = await requireAuthenticatedUser();
    } catch {
      // O logout continua idempotente quando a sessÃ£o jÃ¡ expirou.
    }
    const rawDeviceId = session ? await getMerchantPushDeviceCookie() : null;
    const deviceId = deviceIdSchema.safeParse(rawDeviceId);
    if (session && deviceId.success) {
      await disableStoreStaffPushSubscriptionsForLogout(session.userId, deviceId.data);
    }
    if (rawDeviceId) {
      await clearMerchantPushDeviceCookie();
    }
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
