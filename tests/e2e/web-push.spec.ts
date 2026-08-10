import { expect, test } from '@playwright/test';

test.describe('Web Push transacional', () => {
  test('mantém a API desabilitada por padrão sem expor detalhes', async ({ request }) => {
    const token = '00000000-0000-4000-8000-000000000001';
    const response = await request.get(
      `/api/orders/track/${token}/push-subscription?storeSlug=loja&endpointHash=${'a'.repeat(64)}`,
    );
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(await response.json()).toEqual({ enabled: false });
  });

  test('carrega o CTA no rastreamento quando o ambiente fornece VAPID', async ({ page }) => {
    const storeSlug = process.env.E2E_STORE_SLUG;
    const token = process.env.E2E_ORDER_TRACKING_TOKEN;
    test.skip(
      !storeSlug || !token || process.env.E2E_WEB_PUSH_ENABLED !== 'true',
      'Loja, pedido e Web Push E2E não foram configurados.',
    );

    await page.goto(`/${storeSlug}/order/${token}`);
    await expect(page.getByText('Atualizações deste pedido')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ativar' })).toBeVisible();
  });
});
