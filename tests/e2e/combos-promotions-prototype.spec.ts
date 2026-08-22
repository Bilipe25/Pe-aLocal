import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const screenshotDirectory = path.resolve('public/prototypes/combos-promotions/screenshots');

async function openPrototype(
  page: Page,
  screen: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(`index.html?screen=${screen}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
        ),
    );
  });

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test('merchant desktop — gestão de ofertas em 1440×900', async ({ page }) => {
  await openPrototype(page, 'merchant', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Ofertas', exact: true })).toBeVisible();
  await expect(page.getByText('Combo X-Bacon', { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'merchant-desktop-1440x900.png'),
  });
});

test('merchant tablet — criação de combo em 1024×768', async ({ page }) => {
  await openPrototype(page, 'combo', { width: 1024, height: 768 });
  await expect(page.getByRole('heading', { name: 'Criar combo' })).toBeVisible();
  await expect(page.getByText('Seu cliente economiza')).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'merchant-tablet-1024x768.png'),
  });
});

test('storefront mobile — vitrine em 390×844', async ({ page }) => {
  await openPrototype(page, 'storefront', { width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Ofertas', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Escolher opções/ })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'storefront-mobile-390x844.png'),
  });
});

test('cart mobile — combo agrupado em 390×844', async ({ page }) => {
  await openPrototype(page, 'cart', { width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
  await expect(page.getByText('Economia no combo')).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'cart-mobile-390x844.png'),
  });
});
