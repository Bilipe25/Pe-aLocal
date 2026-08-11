import { expect, test } from '@playwright/test';

test.describe('Web Push operacional', () => {
  test('preserva o deep link completo ao pedir autenticaÃ§Ã£o', async ({ page }) => {
    const storeId = '00000000-0000-4000-8000-000000000001';
    const orderId = '00000000-0000-4000-8000-000000000002';
    await page.goto(`/dashboard/orders/open?store=${storeId}&order=${orderId}`);
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?redirect=${encodeURIComponent(`/dashboard/orders/open?store=${storeId}&order=${orderId}`)}`,
      ),
    );
  });

  test('mostra o controle somente no ambiente autenticado e habilitado', async ({ page }) => {
    test.skip(
      process.env.E2E_MERCHANT_WEB_PUSH_ENABLED !== 'true' || !process.env.E2E_OWNER_EMAIL,
      'Merchant Push autenticado nÃ£o configurado para este ambiente.',
    );
    await page.goto('/dashboard/orders');
    await expect(page.getByRole('button', { name: /Alertas/ })).toBeVisible();
  });
});
