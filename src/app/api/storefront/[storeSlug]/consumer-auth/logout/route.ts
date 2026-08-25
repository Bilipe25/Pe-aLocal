import { NextResponse } from 'next/server';
import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, ValidationError } from '@/server/errors';
import { applyConsumerHeaders, assertConsumerMutationRequest } from '@/server/http/consumer-route';
import {
  clearConsumerSessionCookieOptions,
  CONSUMER_SESSION_COOKIE,
  logoutConsumer,
  readCookieHeader,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    if (!paramsSchema.safeParse(await context.params).success) throw new ValidationError();
    await logoutConsumer(readCookieHeader(request, CONSUMER_SESSION_COOKIE));
    const response = NextResponse.json({ success: true });
    response.cookies.set(CONSUMER_SESSION_COOKIE, '', clearConsumerSessionCookieOptions());
    return applyConsumerHeaders(response);
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
