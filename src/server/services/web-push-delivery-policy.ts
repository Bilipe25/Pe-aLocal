export const WEB_PUSH_MAX_DELIVERY_ATTEMPTS = 5;
export const WEB_PUSH_DELIVERY_LEASE_MS = 2 * 60 * 1_000;
export const WEB_PUSH_MAX_RETRY_DELAY_SECONDS = 5 * 60;

export function getWebPushRetryDelaySeconds(attempt: number): number {
  return Math.min(WEB_PUSH_MAX_RETRY_DELAY_SECONDS, 5 * 2 ** Math.max(0, attempt - 1));
}
