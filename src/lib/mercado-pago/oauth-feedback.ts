export const MERCADO_PAGO_CONNECTION_FEEDBACK = [
  'connected',
  'error',
  'invalid_grant',
  'invalid_client',
  'invalid_scope',
  'rate_limited',
  'provider_error',
  'invalid_response',
  'environment_mismatch',
  'missing_scope',
  'internal_error',
] as const;

export type MercadoPagoConnectionFeedback = (typeof MERCADO_PAGO_CONNECTION_FEEDBACK)[number];

export type MercadoPagoOAuthFailureReason = Exclude<
  MercadoPagoConnectionFeedback,
  'connected' | 'error'
>;

export function parseMercadoPagoConnectionFeedback(
  value: string | undefined,
): MercadoPagoConnectionFeedback | null {
  return MERCADO_PAGO_CONNECTION_FEEDBACK.find((candidate) => candidate === value) ?? null;
}
