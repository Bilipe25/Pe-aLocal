import { expect, test } from '@playwright/test';

import { credentialsFromEnv, loginAs, mutationsAllowed } from './helpers';

const owner = credentialsFromEnv('OWNER');

test.describe('painel operacional autenticado', () => {
  test('OWNER navega, filtra e abre detalhes de pedido sem vazamento responsivo', async ({
    page,
  }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, owner!);
    await page.goto('/dashboard/orders');

    await expect(page.getByRole('heading', { name: 'Central de pedidos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atualizar pedidos' })).toBeVisible();
    await page
      .getByRole('group', { name: 'Filtrar pedidos' })
      .getByRole('button', { name: 'Em andamento' })
      .click();
    await page.getByPlaceholder('Cliente, telefone ou pedido').fill('#');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const firstOrder = page.getByRole('button', { name: /Abrir pedido/ }).first();
    test.skip((await firstOrder.count()) === 0, 'A loja E2E nao possui pedido para abrir.');
    await firstOrder.click();

    const details = page.getByRole('dialog');
    await expect(details).toBeVisible();
    await expect(details.getByText('Cliente').first()).toBeVisible();
    await expect(details.getByText(/Itens/).first()).toBeVisible();
  });

  test('acao de status fica protegida por opt-in de mutacao', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Mutacao operacional roda uma unica vez.');
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    test.skip(
      !mutationsAllowed(),
      'Defina E2E_ALLOW_MUTATIONS=true somente para uma loja descartavel de teste.',
    );

    await loginAs(page, owner!);
    await page.goto('/dashboard/orders');
    await page
      .getByRole('group', { name: 'Filtrar pedidos' })
      .getByRole('button', { name: 'Em andamento' })
      .click();

    const pendingOrder = page.getByRole('button', { name: /Abrir pedido .*Novo/ }).first();
    test.skip((await pendingOrder.count()) === 0, 'Nenhum pedido novo disponivel para aceite.');
    await pendingOrder.click();

    await page.getByRole('button', { name: 'Aceitar Pedido' }).click();
    await expect(page.getByText('Pedido aceito.')).toBeVisible();
  });
});
