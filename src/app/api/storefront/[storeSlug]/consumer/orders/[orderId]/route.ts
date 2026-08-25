import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, ValidationError } from '@/server/errors';
import { applyConsumerHeaders } from '@/server/http/consumer-route';
import { getConsumerOrderDetail } from '@/server/services/consumer-account.service';
import { CONSUMER_SESSION_COOKIE, readCookieHeader } from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema, orderId: z.guid() }).strict();

export async function GET(request: Request, context: { params: Promise<{ storeSlug: string; orderId: string }> }) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ValidationError();
    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) throw new ValidationError();
    return applyConsumerHeaders(Response.json(await getConsumerOrderDetail({
      storeSlug: params.data.storeSlug,
      orderId: params.data.orderId,
      sessionToken: readCookieHeader(request, CONSUMER_SESSION_COOKIE),
    })));
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
