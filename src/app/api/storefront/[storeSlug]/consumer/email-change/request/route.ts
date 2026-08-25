import { z } from 'zod';

import { consumerEmailChangeRequestSchema } from '@/schemas/consumer-auth';
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
  hashConsumerSecret,
  readCookieHeader,
  requestConsumerEmailChange,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const params = paramsSchema.safeParse(await context.params);
    const input = consumerEmailChangeRequestSchema.safeParse(await readConsumerJson(request));
    if (!params.success || !input.success) throw new ValidationError();
    const ipHash = await hashConsumerSecret(`ip:${consumerClientAddress(request)}`);
    const emailHash = await hashConsumerSecret(`email:${input.data.email}`);
    const limiter = getRateLimiter();
    const checks = await Promise.all([
      limiter.check({
        identifier: `consumer-email-change-ip:${ipHash}`,
        ...RATE_LIMITS.consumerVerificationByIp,
        strict: isDeployedRuntime(),
      }),
      limiter.check({
        identifier: `consumer-email-change-subject:${emailHash}`,
        ...RATE_LIMITS.consumerVerificationByEmail,
        strict: isDeployedRuntime(),
      }),
    ]);
    if (checks.some((check) => check.unavailable || !check.allowed)) throw new RateLimitError();
    const result = await requestConsumerEmailChange({
      storeSlug: params.data.storeSlug,
      sessionToken: readCookieHeader(request, CONSUMER_SESSION_COOKIE),
      newEmailNormalized: input.data.email,
      requestIpHash: ipHash,
    });
    return applyConsumerHeaders(
      Response.json({
        ...result,
        message: 'Se o endereço puder receber mensagens, o código será enviado em instantes.',
      }),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
