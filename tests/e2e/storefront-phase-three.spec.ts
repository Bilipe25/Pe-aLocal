import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const storeSlug = process.env.E2E_STORE_SLUG;

test.describe('storefront mobile — fase 3', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Validação exclusiva da navegação mobile.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG não foi configurado.');
    await page.goto(`/${storeSlug}`);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('pedidolocal:favorites:') || key.startsWith('pedidolocal:last-order:')) {
          localStorage.removeItem(key);
        }
      }
    });
    await page.reload();
  });

  test('mantém três destinos e apresenta o estado vazio do último pedido', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
    await expect(navigation).toBeVisible();
    await expect(navigation.locator('a, button')).toHaveCount(3);
    await expect(navigation.getByRole('link', { name: 'Cardápio' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await navigation.getByRole('button', { name: 'Meu pedido' }).click();
    await expect(navigation.getByRole('status')).toContainText(
      'Você ainda não tem um pedido recente nesta loja.',
    );
  });

  test('persiste favorito após recarregar sem depender de conta', async ({ page }) => {
    const favoriteButtons = page.locator('.storefront-product-favorite');
    test.skip((await favoriteButtons.count()) === 0, 'A loja E2E não possui produtos publicados.');

    const favorite = favoriteButtons.first();
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    const removeLabel = await favorite.getAttribute('aria-label');
    expect(removeLabel).toMatch(/^Remover .+ dos favoritos$/);

    await page.reload();
    await expect(page.getByRole('button', { name: removeLabel! }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('navegação e favoritos não introduzem violações graves de acessibilidade', async ({
    page,
  }) => {
    await expect(
      page.getByRole('navigation', { name: 'Navegação da loja' }).getByRole('link', {
        name: 'Cardápio',
      }),
    ).toHaveAttribute('aria-current', 'page');
    const results = await new AxeBuilder({ page })
      .include('.storefront-bottom-nav')
      .include('.storefront-product-card')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const violations = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target),
      })),
    ).toEqual([]);
  });
});
