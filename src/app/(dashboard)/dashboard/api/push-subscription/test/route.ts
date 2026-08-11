import { getCloudflareContext } from '@opennextjs/cloudflare';

import { webPushDisableInputSchema } from '@/schemas/web-push';
import { errorToResponse, NotFoundError, RateLimitError, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import { getStoreStaffPushAssociationForTest } from '@/server/services/store-staff-push-subscription.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

const HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request: Request) {
  try {
    if (String(process.env.MERCHANT_WEB_PUSH_ENABLED) !== 'true') {
      throw new NotFoundError('Recurso');
    }
    if (request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new ValidationError('RequisiÃ§Ã£o invÃ¡lida.');
    }
    const origin = request.headers.get('origin');
    if ((isDeployedRuntime() && !origin) || (origin && origin !== new URL(request.url).origin)) {
      throw new ValidationError('Origem invÃ¡lida.');
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new ValidationError('ConteÃºdo invÃ¡lido.');
    }
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
      throw new ValidationError('ConteÃºdo muito grande.');
    }
    const body = webPushDisableInputSchema.safeParse(
      (() => {
        try {
          return JSON.parse(rawBody) as unknown;
        } catch {
          return null;
        }
      })(),
    );
    if (!body.success) throw new ValidationError('InscriÃ§Ã£o Push invÃ¡lida.');
    const active = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    const limit = await getRateLimiter().check({
      identifier: `merchant-push-test:${active.session.userId}`,
      ...RATE_LIMITS.merchantPushTest,
      strict: isDeployedRuntime(),
    });
    if (limit.unavailable || !limit.allowed)
      throw new RateLimitError('Aguarde antes de testar novamente.');
    const context = {
      userId: active.session.userId,
      tenantId: active.session.tenantId,
      tenantRole: active.session.tenantRole,
      storeId: active.store.id,
    };
    const association = await getStoreStaffPushAssociationForTest(context, body.data.endpointHash);
    if (!association) throw new NotFoundError('InscriÃ§Ã£o');
    const { env } = await getCloudflareContext({ async: true });
    const worker = (env as CloudflareEnv & { ORDER_EVENTS_WORKER: Fetcher }).ORDER_EVENTS_WORKER;
    const response = await worker.fetch(
      'https://order-events.internal/internal/merchant-push/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ associationId: association.id }),
      },
    );
    const result = await response.json();
    return Response.json(result, { status: response.status, headers: HEADERS });
  } catch (error) {
    const response = errorToResponse(error);
    response.headers.set('Cache-Control', HEADERS['Cache-Control']);
    return response;
  }
}
