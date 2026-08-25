import { z } from 'zod';

import { slugSchema } from '@/schemas/store';
import { errorToResponse, ValidationError } from '@/server/errors';
import {
  applyConsumerHeaders,
  assertConsumerMutationRequest,
  readConsumerJson,
} from '@/server/http/consumer-route';
import { CONSUMER_SESSION_COOKIE, readCookieHeader } from '@/server/services/consumer-auth.service';
import {
  listConsumerSessions,
  revokeConsumerSession,
  revokeOtherConsumerSessions,
} from '@/server/services/consumer-session.service';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ storeSlug: slugSchema }).strict();
const revokeSchema = z.object({ sessionId: z.string().uuid() }).strict();
const revokeOthersSchema = z.object({ revokeOthers: z.literal(true) }).strict();

async function parseParams(context: { params: Promise<{ storeSlug: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}

function token(request: Request) {
  return readCookieHeader(request, CONSUMER_SESSION_COOKIE);
}

export async function GET(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ValidationError();
    const { storeSlug } = await parseParams(context);
    return applyConsumerHeaders(
      Response.json(await listConsumerSessions({ storeSlug, sessionToken: token(request) })),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ storeSlug: string }> },
) {
  try {
    assertConsumerMutationRequest(request);
    const { storeSlug } = await parseParams(context);
    const parsed = revokeSchema.safeParse(await readConsumerJson(request));
    if (!parsed.success) throw new ValidationError();
    return applyConsumerHeaders(
      Response.json(
        await revokeConsumerSession({
          storeSlug,
          sessionToken: token(request),
          sessionId: parsed.data.sessionId,
        }),
      ),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const { storeSlug } = await parseParams(context);
    const parsed = revokeOthersSchema.safeParse(await readConsumerJson(request));
    if (!parsed.success) throw new ValidationError();
    return applyConsumerHeaders(
      Response.json(await revokeOtherConsumerSessions({ storeSlug, sessionToken: token(request) })),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
