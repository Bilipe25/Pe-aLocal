import { NextResponse } from 'next/server';
import { z } from 'zod';

import { consumerEmailChangeConfirmSchema } from '@/schemas/consumer-auth';
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
  confirmConsumerEmailChange,
  CONSUMER_SESSION_COOKIE,
  consumerSessionCookieOptions,
  hashConsumerSecret,
  readCookieHeader,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const params = paramsSchema.safeParse(await context.params);
    const input = consumerEmailChangeConfirmSchema.safeParse(await readConsumerJson(request));
    if (!params.success || !input.success) throw new ValidationError();
    const fingerprint = await hashConsumerSecret(
      `${consumerClientAddress(request)}:${input.data.challengeToken}`,
    );
    const rateLimit = await getRateLimiter().check({
      identifier: `consumer-email-change-confirm:${fingerprint}`,
      ...RATE_LIMITS.consumerVerificationConfirm,
      strict: isDeployedRuntime(),
    });
    if (rateLimit.unavailable || !rateLimit.allowed) throw new RateLimitError();
    const result = await confirmConsumerEmailChange({
      storeSlug: params.data.storeSlug,
      sessionToken: readCookieHeader(request, CONSUMER_SESSION_COOKIE),
      challengeToken: input.data.challengeToken,
      code: input.data.code,
    });
    const response = NextResponse.json({ success: true });
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
