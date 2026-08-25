import { NextResponse } from 'next/server';
import { z } from 'zod';

import { consumerVerificationConfirmSchema } from '@/schemas/consumer-auth';
import { slugSchema } from '@/schemas/store';
import { errorToResponse, RateLimitError, ValidationError } from '@/server/errors';
import {
  applyConsumerHeaders,
  assertConsumerMutationRequest,
  consumerClientAddress,
  readConsumerJson,
} from '@/server/http/consumer-route';
import { getRateLimiter, RATE_LIMITS } from '@/server/rate-limit';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  CONSUMER_SESSION_COOKIE,
  consumerSessionCookieOptions,
  describeConsumerDevice,
  hashConsumerSecret,
  verifyConsumerCode,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const params = paramsSchema.safeParse(await context.params);
    const input = consumerVerificationConfirmSchema.safeParse(await readConsumerJson(request));
    if (!params.success || !input.success) throw new ValidationError();
    const fingerprint = await hashConsumerSecret(
      `${consumerClientAddress(request)}:${input.data.challengeToken}`,
    );
    const rateLimit = await getRateLimiter().check({
      identifier: `consumer-verification-confirm:${fingerprint}`,
      ...RATE_LIMITS.consumerVerificationConfirm,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable || !rateLimit.allowed) throw new RateLimitError();

    const result = await verifyConsumerCode({
      storeSlug: params.data.storeSlug,
      challengeToken: input.data.challengeToken,
      code: input.data.code,
      deviceLabel: describeConsumerDevice(request.headers.get('user-agent')),
    });
    const response = NextResponse.json({
      linked: result.linked,
      customerName: result.customerName,
    });
    response.cookies.set(
      CONSUMER_SESSION_COOKIE,
      result.sessionToken,
      consumerSessionCookieOptions(result.expiresAt),
    );
    return applyConsumerHeaders(response);
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
