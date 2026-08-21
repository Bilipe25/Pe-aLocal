import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const prototypeUrl = pathToFileURL(
  path.resolve('public/prototypes/combos-promotions-v2/index.html'),
);
const screenshotDirectory = path.resolve('public/prototypes/combos-promotions-v2/screenshots');

async function openPrototype(
  page: Page,
  screen: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(`${prototypeUrl.href}?screen=${screen}`, { waitUntil: 'load' });
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

test('gestão do estabelecimento — 1440×900', async ({ page }) => {
  await openPrototype(page, 'merchant', { width: 1440, height: 900 });
  await expect(page.getByRole('heading', { name: 'Ofertas', exact: true })).toBeVisible();
  await expect(page.locator('#merchant').getByText('Monte seu Xis', { exact: true })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'merchant-desktop-1440x900.png'),
  });
});

test('criação da oferta no tablet — 1024×768', async ({ page }) => {
  await openPrototype(page, 'builder', { width: 1024, height: 768 });
  await expect(
    page.locator('#builder').getByRole('heading', { level: 1, name: 'Monte seu Xis' }),
  ).toBeVisible();
  await expect(page.locator('#builder').getByText('Prévia para o cliente')).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'merchant-tablet-1024x768.png'),
  });
});

test('vitrine com ofertas — 390×844', async ({ page }) => {
  await openPrototype(page, 'storefront', { width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Ofertas para agora' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Escolher itens/ })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'storefront-mobile-390x844.png'),
  });
});

test('escolha do combo flexível — 390×844', async ({ page }) => {
  await openPrototype(page, 'flexible', { width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Monte seu Xis' })).toBeVisible();
  await expect(
    page.locator('#flexible .sticky-add').getByText('2 escolhas concluídas'),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDirectory, 'flexible-combo-mobile-390x844.png'),
  });
});

test('carrinho com empilhamento transparente — 390×844', async ({ page }) => {
  await openPrototype(page, 'cart', { width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Revise seu pedido' })).toBeVisible();
  await expect(page.getByText('Você ganhou frete grátis')).toBeVisible();
  await expect(page.getByText('Você economizou R$ 27,00')).toBeVisible();
  await page.locator('#cart .price-breakdown').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 110));
  await page.screenshot({
    path: path.join(screenshotDirectory, 'cart-mobile-390x844.png'),
  });
});
