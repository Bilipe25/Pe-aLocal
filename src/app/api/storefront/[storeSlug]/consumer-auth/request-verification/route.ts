import { z } from 'zod';

import { consumerVerificationRequestSchema } from '@/schemas/consumer-auth';
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
  getConsumerDeviceToken,
  getConsumerStoreScope,
  hashConsumerSecret,
  requestConsumerVerification,
  resolveConsumerVerificationContext,
} from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const params = paramsSchema.safeParse(await context.params);
    const input = consumerVerificationRequestSchema.safeParse(await readConsumerJson(request));
    if (!params.success || !input.success) throw new ValidationError();
    const scope = await getConsumerStoreScope(params.data.storeSlug);
    if (!scope) throw new ValidationError();
    const ipHash = await hashConsumerSecret(`ip:${consumerClientAddress(request)}`);
    const strict = isDeployedRuntime();
    const limiter = getRateLimiter();
    const baseResults = await Promise.all([
      limiter.check({
        identifier: `consumer-verification-ip:${scope.tenantId}:${ipHash}`,
        ...RATE_LIMITS.consumerVerificationByIp,
        strict,
      }),
      limiter.check({
        identifier: `consumer-verification-store:${scope.id}`,
        ...RATE_LIMITS.consumerVerificationByStore,
        strict,
      }),
    ]);
    if (baseResults.some((result) => result.unavailable)) {
      throw new RateLimitError('A confirmação está temporariamente indisponível.');
    }
    if (baseResults.some((result) => !result.allowed)) throw new RateLimitError();

    const verificationContext = await resolveConsumerVerificationContext({
      storeSlug: params.data.storeSlug,
      request: input.data,
      deviceToken: getConsumerDeviceToken(request),
    });
    const subjectHash = await hashConsumerSecret(
      `${verificationContext.subject.kind}:${verificationContext.subject.normalized}`,
    );
    const subjectResult = await limiter.check({
      identifier: `consumer-verification-${verificationContext.subject.kind}:${scope.tenantId}:${subjectHash}`,
      ...(verificationContext.subject.kind === 'email'
        ? RATE_LIMITS.consumerVerificationByEmail
        : RATE_LIMITS.consumerVerificationByPhone),
      strict,
    });
    if (subjectResult.unavailable) {
      throw new RateLimitError('A confirmação está temporariamente indisponível.');
    }
    if (!subjectResult.allowed) throw new RateLimitError();

    const result = await requestConsumerVerification({
      context: verificationContext,
    });
    return applyConsumerHeaders(
      Response.json({
        ...result,
        message:
          verificationContext.subject.kind === 'email'
            ? 'Se o endereço puder receber mensagens, o código será enviado em instantes.'
            : 'Se o número puder receber mensagens, o código será enviado em instantes.',
      }),
    );
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
