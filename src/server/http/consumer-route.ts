import { ValidationError } from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';

const MAX_BODY_BYTES = 4 * 1_024;

export const CONSUMER_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const;

function invalidRequest() {
  return new ValidationError('Os dados enviados são inválidos.');
}

export function assertConsumerMutationRequest(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw invalidRequest();
  const origin = request.headers.get('origin');
  if (!origin) {
    if (isDeployedRuntime()) throw invalidRequest();
  } else {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) throw invalidRequest();
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw invalidRequest();
    }
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw invalidRequest();
  }
  const declared = request.headers.get('content-length');
  if (declared && /^\d+$/u.test(declared) && Number(declared) > MAX_BODY_BYTES) {
    throw invalidRequest();
  }
}

export async function readConsumerJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw invalidRequest();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidRequest();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw invalidRequest();
  }
}

export function consumerClientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function applyConsumerHeaders(response: Response) {
  for (const [name, value] of Object.entries(CONSUMER_PRIVATE_HEADERS))
    response.headers.set(name, value);
  return response;
}
