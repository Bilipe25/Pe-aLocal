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
  listConsumerFavorites,
  mergeConsumerFavorites,
  removeConsumerFavorite,
} from '@/server/services/consumer-favorite.service';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ storeSlug: slugSchema }).strict();
const productIdSchema = z.string().uuid();
const mergeSchema = z.union([
  z.object({ productIds: z.array(productIdSchema).max(1_000) }).strict(),
  z.object({ productId: productIdSchema }).strict(),
]);
const removeSchema = z.object({ productId: productIdSchema }).strict();

async function readParams(context: { params: Promise<{ storeSlug: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) throw new ValidationError();
  return parsed.data;
}

function sessionToken(request: Request) {
  return readCookieHeader(request, CONSUMER_SESSION_COOKIE);
}

export async function GET(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ValidationError();
    const { storeSlug } = await readParams(context);
    return applyConsumerHeaders(
      Response.json(
        await listConsumerFavorites({ storeSlug, sessionToken: sessionToken(request) }),
      ),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const { storeSlug } = await readParams(context);
    const parsed = mergeSchema.safeParse(await readConsumerJson(request));
    if (!parsed.success) throw new ValidationError();
    const productIds =
      'productIds' in parsed.data ? parsed.data.productIds : [parsed.data.productId];
    return applyConsumerHeaders(
      Response.json(
        await mergeConsumerFavorites({
          storeSlug,
          sessionToken: sessionToken(request),
          productIds,
        }),
      ),
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
    const { storeSlug } = await readParams(context);
    const parsed = removeSchema.safeParse(await readConsumerJson(request));
    if (!parsed.success) throw new ValidationError();
    return applyConsumerHeaders(
      Response.json(
        await removeConsumerFavorite({
          storeSlug,
          sessionToken: sessionToken(request),
          productId: parsed.data.productId,
        }),
      ),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
