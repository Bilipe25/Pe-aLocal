import { z } from 'zod';

import { consumerVerificationResendSchema } from '@/schemas/consumer-auth';
import { slugSchema } from '@/schemas/store';
import { errorToResponse, ValidationError } from '@/server/errors';
import { applyConsumerHeaders, assertConsumerMutationRequest, readConsumerJson } from '@/server/http/consumer-route';
import { resendConsumerVerification } from '@/server/services/consumer-auth.service';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ storeSlug: slugSchema }).strict();

export async function POST(request: Request, context: { params: Promise<{ storeSlug: string }> }) {
  try {
    assertConsumerMutationRequest(request);
    const params = paramsSchema.safeParse(await context.params);
    const input = consumerVerificationResendSchema.safeParse(await readConsumerJson(request));
    if (!params.success || !input.success) throw new ValidationError();
    return applyConsumerHeaders(Response.json(await resendConsumerVerification({
      storeSlug: params.data.storeSlug,
      challengeToken: input.data.challengeToken,
    })));
  } catch (error) {
    return applyConsumerHeaders(errorToResponse(error));
  }
}
