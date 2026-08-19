import 'server-only';

import { z } from 'zod';

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']),
  MERCADO_PAGO_CLIENT_ID: z.string().trim().min(1),
  MERCADO_PAGO_CLIENT_SECRET: z.string().trim().min(1),
  MERCADO_PAGO_REDIRECT_URI: z.string().url(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().trim().min(1),
  MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY: z.string().trim().min(1),
  MERCADO_PAGO_TEST_APPLICATION_ID: z.string().trim().min(1).optional(),
  MERCADO_PAGO_TEST_ACCESS_TOKEN: z.string().trim().min(1).optional(),
});

const requiredConfigurationKeys = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'MERCADO_PAGO_REDIRECT_URI',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'MERCADO_PAGO_CREDENTIAL_ENCRYPTION_KEY',
] as const;
const sandboxRequiredConfigurationKeys = [
  'MERCADO_PAGO_TEST_APPLICATION_ID',
  'MERCADO_PAGO_TEST_ACCESS_TOKEN',
] as const;

export type MercadoPagoOAuthEnvironment = 'sandbox' | 'production';

export class MercadoPagoOAuthEnvironmentMismatchError extends Error {
  readonly code = 'OAUTH_ENVIRONMENT_MISMATCH';

  constructor(
    readonly expectedEnvironment: MercadoPagoOAuthEnvironment,
    readonly receivedTestUser: boolean,
  ) {
    super('O tipo de conta Mercado Pago não corresponde ao ambiente configurado.');
    this.name = 'MercadoPagoOAuthEnvironmentMismatchError';
  }
}

export class MercadoPagoOrdersCredentialError extends Error {
  readonly code = 'ORDERS_UNSUPPORTED_CREDENTIAL';

  constructor() {
    super('A credencial Mercado Pago não é compatível com a Orders API.');
    this.name = 'MercadoPagoOrdersCredentialError';
  }
}

export const MERCADO_PAGO_API_ORIGIN = 'https://api.mercadopago.com';
export const MERCADO_PAGO_AUTH_ORIGIN = 'https://auth.mercadopago.com';
export const MERCADO_LIBRE_API_ORIGIN = 'https://api.mercadolibre.com';
export const MERCADO_PAGO_PIX_EXPIRATION = 'PT30M';

type MercadoPagoRuntimeEnv = Record<string, string | undefined>;

export function isMercadoPagoEnabled(env: MercadoPagoRuntimeEnv = process.env): boolean {
  return String(env.MERCADO_PAGO_ENABLED) === 'true';
}

export function isMercadoPagoOrdersCredentialReady(
  env: MercadoPagoRuntimeEnv = process.env,
): boolean {
  const parsedEnvironment = z.enum(['development', 'staging', 'production']).safeParse(env.APP_ENV);
  if (!parsedEnvironment.success) return false;
  const environment = parsedEnvironment.data === 'production' ? 'production' : 'sandbox';
  return (
    environment === 'production' ||
    (Boolean(env.MERCADO_PAGO_TEST_APPLICATION_ID?.trim()) &&
      String(env.MERCADO_PAGO_TEST_ACCESS_TOKEN).startsWith('APP_USR-'))
  );
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
  const parsedEnvironment = z.enum(['development', 'staging', 'production']).safeParse(env.APP_ENV);
  const requiredKeys = [
    ...requiredConfigurationKeys,
    ...(parsedEnvironment.success && parsedEnvironment.data !== 'production'
      ? sandboxRequiredConfigurationKeys
      : []),
  ];
  const configuredBindings = requiredKeys.filter(
    (key) => typeof env[key] === 'string' && env[key]?.trim().length,
  ).length;
  const baseConfigurationReady = configSchema.safeParse(env).success;

  return {
    rolloutEnabled: isMercadoPagoEnabled(env),
    configurationReady:
      baseConfigurationReady &&
      (parsedEnvironment.success && parsedEnvironment.data !== 'production'
        ? isMercadoPagoOrdersCredentialReady(env)
        : true),
    configuredBindings,
    requiredBindings: requiredKeys.length,
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

export function assertMercadoPagoSellerEnvironment(
  isTestUser: boolean,
  expectedEnvironment: MercadoPagoOAuthEnvironment,
): void {
  const expectedTestUser = expectedEnvironment === 'sandbox';
  if (isTestUser !== expectedTestUser) {
    throw new MercadoPagoOAuthEnvironmentMismatchError(expectedEnvironment, isTestUser);
  }
}

export function assertMercadoPagoOrdersCompatibleAccessToken(accessToken: string): void {
  if (!accessToken.startsWith('APP_USR-')) {
    throw new MercadoPagoOrdersCredentialError();
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
    testApplicationId: parsed.data.MERCADO_PAGO_TEST_APPLICATION_ID,
    testAccessToken: parsed.data.MERCADO_PAGO_TEST_ACCESS_TOKEN,
    oauthEnvironment: getMercadoPagoOAuthEnvironment(parsed.data),
  };
}

export function getMercadoPagoWebhookApplicationId(
  config: ReturnType<typeof getMercadoPagoConfig> = getMercadoPagoConfig(),
): string {
  if (config.oauthEnvironment === 'production') return config.clientId;
  if (!config.testApplicationId) {
    throw new Error(
      'O número da aplicação de teste do Mercado Pago não está configurado neste ambiente.',
    );
  }
  return config.testApplicationId;
}

export function getMercadoPagoTestAccessToken(env: MercadoPagoRuntimeEnv = process.env): string {
  const config = getMercadoPagoConfig(env);
  if (config.oauthEnvironment !== 'sandbox') {
    throw new Error('A credencial de teste do Mercado Pago não pode ser usada em produção.');
  }
  if (!config.testAccessToken?.startsWith('APP_USR-')) {
    throw new Error(
      'O Access Token de teste da aplicação Mercado Pago não está configurado no staging.',
    );
  }
  return config.testAccessToken;
}
