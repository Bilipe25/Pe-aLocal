import 'server-only';

import { z } from 'zod';

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']),
  MERCADO_PAGO_CLIENT_ID: z.string().trim().min(1),
  MERCADO_PAGO_CLIENT_SECRET: z.string().trim().min(1),
  MERCADO_PAGO_REDIRECT_URI: z.string().url(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().trim().min(1),
  MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY: z.string().trim().min(1),
});

const requiredConfigurationKeys = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'MERCADO_PAGO_REDIRECT_URI',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY',
] as const;

export type MercadoPagoOAuthEnvironment = 'sandbox' | 'production';

export class MercadoPagoOAuthEnvironmentMismatchError extends Error {
  readonly code = 'OAUTH_ENVIRONMENT_MISMATCH';

  constructor(
    readonly expectedEnvironment: MercadoPagoOAuthEnvironment,
    readonly receivedLiveMode: boolean,
  ) {
    super('O ambiente da credencial Mercado Pago não corresponde ao ambiente configurado.');
    this.name = 'MercadoPagoOAuthEnvironmentMismatchError';
  }
}

export const MERCADO_PAGO_API_ORIGIN = 'https://api.mercadopago.com';
export const MERCADO_PAGO_AUTH_ORIGIN = 'https://auth.mercadopago.com';
export const MERCADO_PAGO_PIX_EXPIRATION = 'PT30M';

type MercadoPagoRuntimeEnv = Record<string, string | undefined>;

export function isMercadoPagoEnabled(env: MercadoPagoRuntimeEnv = process.env): boolean {
  return String(env.MERCADO_PAGO_ENABLED) === 'true';
}

export interface MercadoPagoOperationalReadiness {
  rolloutEnabled: boolean;
  configurationReady: boolean;
  configuredBindings: number;
  requiredBindings: number;
  environment: MercadoPagoOAuthEnvironment | 'INVALID';
}

/**
 * Retorna apenas metadados operacionais seguros para o Super Admin. Valores e
 * nomes individuais de secrets nunca atravessam a fronteira do servidor.
 */
export function getMercadoPagoOperationalReadiness(
  env: MercadoPagoRuntimeEnv = process.env,
): MercadoPagoOperationalReadiness {
  const configuredBindings = requiredConfigurationKeys.filter(
    (key) => typeof env[key] === 'string' && env[key]?.trim().length,
  ).length;
  const parsedEnvironment = z.enum(['development', 'staging', 'production']).safeParse(env.APP_ENV);

  return {
    rolloutEnabled: isMercadoPagoEnabled(env),
    configurationReady: configSchema.safeParse(env).success,
    configuredBindings,
    requiredBindings: requiredConfigurationKeys.length,
    environment: parsedEnvironment.success
      ? parsedEnvironment.data === 'production'
        ? 'production'
        : 'sandbox'
      : 'INVALID',
  };
}

export function getMercadoPagoOAuthEnvironment(
  env: { APP_ENV?: string } = process.env,
): MercadoPagoOAuthEnvironment {
  const appEnvironment = z.enum(['development', 'staging', 'production']).safeParse(env.APP_ENV);
  if (!appEnvironment.success) {
    throw new Error('O ambiente OAuth do Mercado Pago não está configurado.');
  }
  return appEnvironment.data === 'production' ? 'production' : 'sandbox';
}

export function assertMercadoPagoOAuthEnvironment(
  liveMode: boolean,
  expectedEnvironment: MercadoPagoOAuthEnvironment,
): void {
  const expectedLiveMode = expectedEnvironment === 'production';
  if (liveMode !== expectedLiveMode) {
    throw new MercadoPagoOAuthEnvironmentMismatchError(expectedEnvironment, liveMode);
  }
}

export function getMercadoPagoConfig(env: MercadoPagoRuntimeEnv = process.env) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error('A integração Mercado Pago não está configurada neste ambiente.');
  }
  return {
    clientId: parsed.data.MERCADO_PAGO_CLIENT_ID,
    clientSecret: parsed.data.MERCADO_PAGO_CLIENT_SECRET,
    redirectUri: parsed.data.MERCADO_PAGO_REDIRECT_URI,
    webhookSecret: parsed.data.MERCADO_PAGO_WEBHOOK_SECRET,
    encryptionKey: parsed.data.MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY,
    oauthEnvironment: getMercadoPagoOAuthEnvironment(parsed.data),
    oauthTestMode: parsed.data.APP_ENV !== 'production',
  };
}
