import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { credentialsFromEnv, loginAs } from './helpers';

async function expectNoHighImpactViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
}

test.describe('acessibilidade WCAG', () => {
  test('home e login não possuem violações críticas ou sérias', async ({ page }) => {
    await page.goto('/');
    await expectNoHighImpactViolations(page);

    await page.goto('/login');
    await expectNoHighImpactViolations(page);
  });

  test('cardápio público mantém semântica e contraste verificáveis', async ({ page }) => {
    const storeSlug = process.env.E2E_STORE_SLUG;
    test.skip(!storeSlug, 'E2E_STORE_SLUG não foi configurado.');

    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`/${storeSlug}`);
    await page.evaluate(() => localStorage.removeItem('pedidolocal-cart'));
    await page.reload();
    await expect(page.locator('.storefront-theme')).toBeVisible();
    await expect(page.getByLabel('Informações para pedir')).toBeVisible();
    await expectNoHighImpactViolations(page);

    expect((await page.title()).match(/PedidoLocal/g)?.length ?? 0).toBe(1);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const search = page.getByRole('searchbox', { name: 'Buscar no cardápio' });
    await search.fill('produto que não existe');
    await expect(page.getByText('Nenhum resultado para “produto que não existe”')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar busca' }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();

    const productCard = page.locator('.storefront-product-card:not(:disabled)').first();
    test.skip((await productCard.count()) === 0, 'A loja E2E não possui produto disponível.');

    await productCard.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /Fechar detalhes de/i })).toBeVisible();
    await expectNoHighImpactViolations(page);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(productCard).toBeFocused();

    await productCard.click();
    const dialog = page.getByRole('dialog');
    const requiredGroups = dialog.locator('section').filter({ hasText: 'Obrigatório' });
    for (let index = 0; index < (await requiredGroups.count()); index += 1) {
      const group = requiredGroups.nth(index);
      const firstOption = group.locator('[role="radio"], [role="checkbox"]').first();
      if (await firstOption.count()) await firstOption.click();
    }

    await dialog.getByRole('button', { name: /Adicionar ·/ }).click();
    await expect(page.getByText('Adicionado à sacola')).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByText('Ver sacola')).toBeHidden();
  });

  test('editor administrativo não possui violações críticas ou sérias', async ({ page }) => {
    const credentials = credentialsFromEnv('SUPER_ADMIN');
    const tenantId = process.env.E2E_TENANT_ID;
    const storeId = process.env.E2E_STORE_ID;
    test.skip(!credentials || !tenantId || !storeId, 'Ambiente E2E administrativo incompleto.');

    await loginAs(page, credentials!);
    await page.goto(`/admin/tenants/${tenantId}/stores/${storeId}/customization`);
    await expect(page.getByRole('heading', { name: 'Prévia responsiva' })).toBeVisible();
    await expectNoHighImpactViolations(page);
  });

  test('painel do tenant permanece acessível e responsivo', async ({ page }) => {
    const credentials = credentialsFromEnv('OWNER');
    test.skip(!credentials, 'Credenciais E2E de OWNER não foram configuradas.');

    await page.setViewportSize({ width: 320, height: 700 });
    await loginAs(page, credentials!);

    for (const route of [
      '/dashboard',
      '/dashboard/orders',
      '/dashboard/catalog',
      '/dashboard/catalog/products/new',
      '/dashboard/delivery',
      '/dashboard/store',
      '/dashboard/store/hours',
      '/dashboard/store/settings',
    ]) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expectNoHighImpactViolations(page);
    }

    await page.goto('/dashboard/catalog');
    const productLinks = page.locator('a[href*="/dashboard/catalog/products/"][href$="/edit"]');
    for (let index = 0; index < (await productLinks.count()); index += 1) {
      const box = await productLinks.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Abrir menu do painel' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu do painel' })).toBeVisible();
  });
});
