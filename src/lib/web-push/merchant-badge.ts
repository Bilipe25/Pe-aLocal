export const MERCHANT_PUSH_ACTIVE_STORAGE_KEY = 'pedidolocal-merchant-push-active';

export async function applyMerchantBadge(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.trunc(count));
  if (safeCount === 0) {
    await navigator.clearAppBadge?.().catch(() => undefined);
    return;
  }
  await navigator.setAppBadge?.(safeCount).catch(() => undefined);
}
