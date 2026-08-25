import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, ValidationError } from '@/server/errors';
import { applyConsumerHeaders } from '@/server/http/consumer-route';
import { listConsumerOrders } from '@/server/services/consumer-account.service';
import { CONSUMER_SESSION_COOKIE, readCookieHeader } from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function GET(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ValidationError();
    const params = paramsSchema.safeParse(await context.params);
    const page = z.coerce.number().int().min(1).max(10_000).safeParse(new URL(request.url).searchParams.get('page') ?? '1');
    if (!params.success || !page.success) throw new ValidationError();
    return applyConsumerHeaders(Response.json(await listConsumerOrders({
      storeSlug: params.data.storeSlug,
      sessionToken: readCookieHeader(request, CONSUMER_SESSION_COOKIE),
      page: page.data,
    })));
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
