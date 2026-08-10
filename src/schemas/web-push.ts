import { z } from 'zod';

const PROVIDER_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);

export function isAllowedWebPushEndpoint(rawEndpoint: string): boolean {
  try {
    const endpoint = new URL(rawEndpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.port ||
      endpoint.hostname === 'localhost' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(endpoint.hostname) ||
      endpoint.hostname.includes(':')
    ) {
      return false;
    }
    const hostname = endpoint.hostname.toLowerCase();
    return PROVIDER_HOSTS.has(hostname) || hostname.endsWith('.push.apple.com');
  } catch {
    return false;
  }
}

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const webPushSubscriptionInputSchema = z
  .object({
    endpoint: z.string().max(4096),
    expirationTime: z.number().int().positive().max(8_640_000_000_000_000).nullable().optional(),
    keys: z.object({
      p256dh: base64UrlSchema.max(256),
      auth: base64UrlSchema.max(128),
    }),
  })
  .superRefine((value, context) => {
    if (!isAllowedWebPushEndpoint(value.endpoint)) {
      context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Provedor Push inválido.' });
    }
    try {
      const p256dh = Buffer.from(value.keys.p256dh, 'base64url');
      const auth = Buffer.from(value.keys.auth, 'base64url');
      if (p256dh.length !== 65 || p256dh[0] !== 4) throw new Error('p256dh');
      if (auth.length !== 16) throw new Error('auth');
    } catch {
      context.addIssue({ code: 'custom', path: ['keys'], message: 'Chaves Push inválidas.' });
    }
  });

export const webPushAssociationQuerySchema = z.object({
  storeSlug: z.string().trim().min(1).max(120),
  endpointHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

export const webPushDisableInputSchema = z.object({
  endpointHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type WebPushSubscriptionInput = z.infer<typeof webPushSubscriptionInputSchema>;
