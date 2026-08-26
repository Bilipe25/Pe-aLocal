import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const storeSlug = process.env.E2E_STORE_SLUG;
const secondStoreSlug = process.env.E2E_SECOND_STORE_SLUG;

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

  test('mantém quatro destinos e abre o hub Mais', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link')).toHaveCount(4);
    await expect(navigation.getByRole('link', { name: 'Cardápio' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await navigation.getByRole('link', { name: 'Mais' }).click();
    await expect(page).toHaveURL(`/${storeSlug}/mais`);
    await expect(page.getByRole('heading', { name: 'Mais', level: 1 })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Navegação da loja' })
        .getByRole('link', { name: 'Mais' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('preserva a mesma instância da navegação entre abas e ao voltar no histórico', async ({
    page,
  }) => {
    const marker = `shell-${Date.now()}`;
    const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
    await navigation.evaluate((element, value) => {
      element.setAttribute('data-e2e-shell-marker', value);
    }, marker);

    await navigation.getByRole('link', { name: 'Mais' }).click();
    await expect(page).toHaveURL(`/${storeSlug}/mais`);
    await expect(page.getByRole('navigation', { name: 'Navegação da loja' })).toHaveAttribute(
      'data-e2e-shell-marker',
      marker,
    );

    await page
      .getByRole('navigation', { name: 'Navegação da loja' })
      .getByRole('link', {
        name: 'Pedidos',
      })
      .click();
    await expect(page).toHaveURL(`/${storeSlug}/orders`);
    await page.goBack();
    await expect(page).toHaveURL(`/${storeSlug}/mais`);
    await expect(page.getByRole('navigation', { name: 'Navegação da loja' })).toHaveAttribute(
      'data-e2e-shell-marker',
      marker,
    );
  });

  test('marca somente o destino acionado durante uma navegação lenta', async ({ page }) => {
    let delayCartNavigation = false;
    await page.route(`**/${storeSlug}/cart**`, async (route) => {
      const headers = route.request().headers();
      const isPrefetch = headers['next-router-prefetch'] === '1' || headers.purpose === 'prefetch';
      if (isPrefetch) {
        await route.abort();
        return;
      }
      if (delayCartNavigation) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.continue();
    });
    await page.reload();
    delayCartNavigation = true;

    const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
    const navigationPromise = navigation.getByRole('link', { name: /Carrinho/ }).click();

    await expect(navigation.locator('.storefront-bottom-nav-item.is-pending')).toHaveCount(1);
    await expect(
      navigation.getByRole('link', { name: /Carrinho/ }).locator('.is-pending'),
    ).toHaveCount(1);
    await navigationPromise;
    await expect(page).toHaveURL(`/${storeSlug}/cart`);
  });

  test('restaura busca e rolagem do catálogo ao retornar de outra aba', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Buscar no cardápio' });
    await search.fill('x');
    await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'auto' }));
    const rememberedScroll = await page.evaluate(() => window.scrollY);

    await page
      .getByRole('navigation', { name: 'Navegação da loja' })
      .getByRole('link', {
        name: 'Mais',
      })
      .click();
    await expect(page).toHaveURL(`/${storeSlug}/mais`);
    await page
      .getByRole('navigation', { name: 'Navegação da loja' })
      .getByRole('link', {
        name: 'Cardápio',
      })
      .click();

    await expect(search).toHaveValue('x');
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThanOrEqual(Math.max(0, rememberedScroll - 8));
  });

  test('não repete a tela de hidratação local do carrinho na segunda visita', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
    await navigation.getByRole('link', { name: /Carrinho/ }).click();
    await expect(page).toHaveURL(`/${storeSlug}/cart`);
    await expect(page.getByText('Carregando sua sacola…')).toHaveCount(0);

    await page
      .getByRole('navigation', { name: 'Navegação da loja' })
      .getByRole('link', {
        name: 'Mais',
      })
      .click();
    await page
      .getByRole('navigation', { name: 'Navegação da loja' })
      .getByRole('link', {
        name: /Carrinho/,
      })
      .click();
    await expect(page).toHaveURL(`/${storeSlug}/cart`);
    await expect(page.getByText('Carregando sua sacola…')).toHaveCount(0);
  });

  test('carrega diretamente cada aba com a navegação íntegra', async ({ page }) => {
    for (const suffix of ['', '/cart', '/orders', '/mais', '/favorites']) {
      await page.goto(`/${storeSlug}${suffix}`);
      const navigation = page.getByRole('navigation', { name: 'Navegação da loja' });
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link')).toHaveCount(4);
    }
  });

  test('isola a memória transitória ao trocar de loja', async ({ page }) => {
    test.skip(!secondStoreSlug, 'E2E_SECOND_STORE_SLUG não foi configurado.');
    await page.getByRole('searchbox', { name: 'Buscar no cardápio' }).fill('pizza');

    await page.goto(`/${secondStoreSlug}`);
    await expect(page.getByRole('searchbox', { name: 'Buscar no cardápio' })).toHaveValue('');

    await page.goto(`/${storeSlug}`);
    await expect(page.getByRole('searchbox', { name: 'Buscar no cardápio' })).toHaveValue('');
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
