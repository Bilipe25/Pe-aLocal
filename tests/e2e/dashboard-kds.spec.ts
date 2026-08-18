import { expect, test, type Page } from '@playwright/test';

import { credentialsFromEnv, loginAs, mutationsAllowed } from './helpers';

const owner = credentialsFromEnv('OWNER');

async function openEnabledKds(page: Page) {
  await loginAs(page, owner!);
  await page.goto('/dashboard/kds');
  const enabled = new URL(page.url()).pathname === '/dashboard/kds';
  test.skip(!enabled, 'O entitlement KDS nao esta habilitado para a loja E2E ativa.');
  await expect(page.getByRole('main', { name: 'Pedidos da cozinha' })).toBeVisible();
}

test.describe('Tela da cozinha autenticada', () => {
  test('desktop mostra as três etapas sem vazamento horizontal', async ({ page }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEnabledKds(page);

    await expect(page.getByRole('heading', { name: 'A fazer' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Em preparo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prontos' })).toBeVisible();
    await expect(page.locator('.kds-lane')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('mobile usa tabs acessíveis e mantém os controles tocáveis', async ({ page }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    await page.setViewportSize({ width: 390, height: 844 });
    await openEnabledKds(page);

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(3);
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.kds-lane-mobile-active')).toHaveAttribute('data-lane', 'MAKING');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    const undersized = await page.locator('button:visible').evaluateAll(
      (buttons) =>
        buttons.filter((button) => {
          const box = button.getBoundingClientRect();
          return box.width < 44 || box.height < 44;
        }).length,
    );
    expect(undersized).toBe(0);
  });

  test('transição real aparece na etapa seguinte', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Mutacao operacional roda uma unica vez.');
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    test.skip(
      !mutationsAllowed(),
      'Defina E2E_ALLOW_MUTATIONS=true somente para uma loja descartavel de teste.',
    );
    await openEnabledKds(page);

    const start = page.getByRole('button', { name: /^Iniciar preparo/ }).first();
    test.skip((await start.count()) === 0, 'Nenhum pedido confirmado disponivel no KDS.');
    const ticket = start.locator('xpath=ancestor::article');
    const orderId = await ticket.getAttribute('data-order-id');
    await start.click();

    await expect(page.locator(`article[data-order-id="${orderId}"]`)).toHaveAttribute(
      'data-order-status',
      'PREPARING',
    );
  });
});
