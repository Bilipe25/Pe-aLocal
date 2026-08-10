import webPush from 'web-push';

export interface WebPushSenderConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface WebPushSendInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: unknown;
  topic: string;
}

export function readWebPushSenderConfig(env: {
  WEB_PUSH_ENABLED?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  WEB_PUSH_VAPID_SUBJECT?: string;
}): WebPushSenderConfig | null {
  if (env.WEB_PUSH_ENABLED !== 'true') return null;
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_VAPID_SUBJECT?.trim();
  const validSubject =
    Boolean(subject?.startsWith('mailto:')) ||
    (() => {
      try {
        return Boolean(subject && new URL(subject).protocol === 'https:');
      } catch {
        return false;
      }
    })();
  return publicKey &&
    /^[A-Za-z0-9_-]{80,100}$/.test(publicKey) &&
    privateKey &&
    /^[A-Za-z0-9_-]{40,60}$/.test(privateKey) &&
    subject &&
    validSubject
    ? { publicKey, privateKey, subject }
    : null;
}

export async function sendWebPushNotification(
  config: WebPushSenderConfig,
  input: WebPushSendInput,
) {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return webPush.sendNotification(
    { endpoint: input.endpoint, keys: { p256dh: input.p256dh, auth: input.auth } },
    JSON.stringify(input.payload),
    { TTL: 3_600, urgency: 'normal', topic: input.topic },
  );
}

export function webPushFailure(error: unknown) {
  const candidate = error as {
    statusCode?: number;
    headers?: Record<string, string>;
    message?: string;
  };
  const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : null;
  const retryAfter = candidate.headers?.['retry-after'];
  const retryAfterSeconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
  return {
    statusCode,
    retryAfterSeconds,
    message: statusCode ? `push_http_${statusCode}` : 'push_transport_error',
    revoked: statusCode === 404 || statusCode === 410,
    transient: statusCode === null || statusCode === 429 || statusCode >= 500,
  };
}
