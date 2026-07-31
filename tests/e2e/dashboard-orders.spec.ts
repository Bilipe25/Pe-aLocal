import { expect, test } from '@playwright/test';

import { credentialsFromEnv, loginAs, mutationsAllowed } from './helpers';

const owner = credentialsFromEnv('OWNER');
const realtimeConfigured = Boolean(
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER &&
  process.env.E2E_STORE_ID,
);

test.describe('painel operacional autenticado', () => {
  test('OWNER navega, filtra e abre detalhes de pedido sem vazamento responsivo', async ({
    page,
  }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');

    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, owner!);
    await page.goto('/dashboard/orders');

    await expect(page.getByRole('heading', { name: /Central de pedidos/i })).toBeVisible();
    await page
      .getByRole('group', { name: 'Filtrar por etapa' })
      .getByRole('button', { name: 'Em preparo' })
      .click();
    await page.getByRole('searchbox', { name: 'Buscar na central de pedidos' }).fill('#');

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
      .getByRole('group', { name: 'Filtrar por etapa' })
      .getByRole('button', { name: 'Novos' })
      .click();

    const pendingOrder = page
      .locator('[data-order-lane="NEW"]')
      .getByRole('button', { name: /Abrir pedido/ })
      .first();
    test.skip((await pendingOrder.count()) === 0, 'Nenhum pedido novo disponivel para aceite.');
    await pendingOrder.click();

    await page.getByRole('button', { name: 'Aceitar Pedido' }).click();
    await expect(page.getByText('Pedido aceito.')).toBeVisible();
  });

  test('desktop mantém quatro colunas e abre os detalhes em drawer sem deslocar o quadro', async ({
    page,
  }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');

    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAs(page, owner!);
    await page.goto('/dashboard/orders');

    await expect(page.locator('[data-order-lane]')).toHaveCount(4);
    for (const lane of await page.locator('[data-order-lane]').all()) {
      expect(await lane.locator('article').count()).toBeLessThanOrEqual(10);
    }
    await expect(
      page.getByRole('searchbox', { name: 'Buscar na central de pedidos' }),
    ).toBeVisible();

    const firstOrder = page.getByRole('button', { name: /Abrir pedido/ }).first();
    test.skip((await firstOrder.count()) === 0, 'A loja E2E nao possui pedido para abrir.');

    for (const width of [1280, 1366, 1440, 1600, 1680]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const scrollOwnership = await page.evaluate(() => {
        const laneList = document.querySelector<HTMLElement>('.orders-lane-list');
        const sidebar = document.querySelector<HTMLElement>('aside');
        const shell = document.querySelector<HTMLElement>('.dashboard-shell');
        const main = document.querySelector<HTMLElement>('main');
        return {
          laneOverflowY: laneList ? getComputedStyle(laneList).overflowY : null,
          mainOverflowY: main ? getComputedStyle(main).overflowY : null,
          shellPosition: shell ? getComputedStyle(shell).position : null,
          sidebarPosition: sidebar ? getComputedStyle(sidebar).position : null,
        };
      });
      expect(scrollOwnership.laneOverflowY).toBe('visible');
      expect(scrollOwnership.mainOverflowY).toBe('visible');
      expect(scrollOwnership.shellPosition).toBe('static');
      expect(scrollOwnership.sidebarPosition).toBe('sticky');

      const boardBoxBefore = await page
        .getByRole('region', { name: 'Quadro operacional de pedidos' })
        .boundingBox();
      await firstOrder.click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(Math.abs(drawerBox!.x + drawerBox!.width - width)).toBeLessThanOrEqual(2);

      const boardBoxAfter = await page
        .getByRole('region', { name: 'Quadro operacional de pedidos' })
        .boundingBox();
      expect(boardBoxAfter?.width).toBe(boardBoxBefore?.width);

      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(firstOrder).toBeFocused();
    }
  });

  test('autoriza o canal privado da loja ativa no runtime', async ({ page, context }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    test.skip(!realtimeConfigured, 'Pusher e E2E_STORE_ID nao estao configurados.');

    await loginAs(page, owner!);
    const origin = new URL(page.url()).origin;
    await context.addCookies([
      {
        name: 'pedidolocal-active-store',
        value: process.env.E2E_STORE_ID!,
        url: `${origin}/dashboard`,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const authorization = await page.evaluate(async (storeId) => {
      const body = new URLSearchParams({
        socket_id: '123.456',
        channel_name: `private-store-${storeId}`,
      });
      const response = await fetch('/dashboard/api/pusher/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      return { status: response.status, body: (await response.json()) as { auth?: string } };
    }, process.env.E2E_STORE_ID!);

    expect(authorization.status).toBe(200);
    expect(authorization.body.auth).toEqual(expect.any(String));
  });
});
