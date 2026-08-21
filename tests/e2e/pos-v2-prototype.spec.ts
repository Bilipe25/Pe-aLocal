import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const prototypeUrl = pathToFileURL(path.resolve('public/prototypes/pos-v2/index.html'));
const screenshotDirectory = path.resolve('public/prototypes/pos-v2/screenshots');

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
  const size = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
}

const cases = [
  {
    name: 'desktop',
    screen: 'pos',
    viewport: { width: 1440, height: 900 },
    file: '01-pos-desktop-1440x900.png',
    heading: 'Novo pedido',
  },
  {
    name: 'tablet',
    screen: 'pos',
    viewport: { width: 1024, height: 768 },
    file: '02-pos-tablet-1024x768.png',
    heading: 'Novo pedido',
  },
  {
    name: 'mobile fallback',
    screen: 'pos',
    viewport: { width: 390, height: 844 },
    file: '03-pos-mobile-390x844.png',
    heading: 'Novo pedido',
  },
  {
    name: 'pedidos em espera',
    screen: 'holds',
    viewport: { width: 1180, height: 820 },
    file: '04-holds-1180x820.png',
    heading: 'Pedidos em espera',
  },
  {
    name: 'repetir pedido',
    screen: 'repeat',
    viewport: { width: 1180, height: 820 },
    file: '05-repeat-1180x820.png',
    heading: 'Repetir #1048',
  },
  {
    name: 'cliente recorrente',
    screen: 'customer',
    viewport: { width: 1024, height: 768 },
    file: '06-customer-1024x768.png',
    heading: 'Identificar cliente',
  },
  {
    name: 'desconto manual',
    screen: 'discount',
    viewport: { width: 1024, height: 768 },
    file: '07-discount-1024x768.png',
    heading: 'Aplicar desconto manual',
  },
  {
    name: 'desconto sem permissao',
    screen: 'no-permission',
    viewport: { width: 1024, height: 768 },
    file: '08-no-permission-1024x768.png',
    heading: 'Desconto não permitido neste acesso',
  },
  {
    name: 'terminal',
    screen: 'terminal',
    viewport: { width: 1024, height: 768 },
    file: '09-terminal-1024x768.png',
    heading: 'Identificar este terminal',
  },
  {
    name: 'modo foco',
    screen: 'focus',
    viewport: { width: 1440, height: 900 },
    file: '10-focus-1440x900.png',
    heading: 'Novo pedido',
  },
  {
    name: 'pos-venda',
    screen: 'success',
    viewport: { width: 1024, height: 768 },
    file: '11-success-1024x768.png',
    heading: 'Pedido #1052 criado',
  },
] as const;

for (const item of cases) {
  test(item.name, async ({ page }) => {
    await openPrototype(page, item.screen, item.viewport);
    await expect(
      page.getByRole('heading', { name: item.heading, exact: true }).first(),
    ).toBeVisible();
    if (item.screen === 'success') {
      await expect(page.locator('.app-shell')).toBeHidden();
      await expect(page.locator('.success-screen')).toBeVisible();
    }
    await page.screenshot({ path: path.join(screenshotDirectory, item.file) });
  });
}

test('busca local e atalhos seguros', async ({ page }) => {
  await openPrototype(page, 'pos', { width: 1024, height: 768 });
  await page.keyboard.press('/');
  await expect(page.locator('#product-search')).toBeFocused();
  await page.locator('#product-search').fill('x bacon');
  await expect(page.locator('.product-grid [data-product="x-bacon"]')).toBeVisible();
  await expect(page.locator('.product-grid [data-product="coca"]')).toBeHidden();
  await page.locator('#product-search').press('?');
  await expect(page.locator('.shortcut-popover')).toBeHidden();
  await page.locator('#product-search').blur();
  await page.keyboard.press('?');
  await expect(page.locator('.shortcut-popover')).toBeVisible();
});

test('modo foco mantém saída visível no desktop', async ({ page }) => {
  await openPrototype(page, 'focus', { width: 1440, height: 900 });
  await expect(page.getByRole('link', { name: 'Sair do foco' })).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
});
