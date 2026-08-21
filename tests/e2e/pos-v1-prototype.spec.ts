import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const prototypeUrl = pathToFileURL(path.resolve('public/prototypes/pos-v1/index.html'));
const screenshotDirectory = path.resolve('public/prototypes/pos-v1/screenshots');

async function openPrototype(page: Page, screen: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(`${prototypeUrl.href}?screen=${screen}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((image) => !image.complete).map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    })));
  });
  const size = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
}

const cases = [
  { name: 'pdv desktop', screen: 'pos', viewport: { width: 1440, height: 900 }, file: '01-pos-desktop-1440x900.png', heading: 'Novo pedido' },
  { name: 'pdv tablet', screen: 'pos', viewport: { width: 1024, height: 768 }, file: '02-pos-tablet-1024x768.png', heading: 'Novo pedido' },
  { name: 'configurar produto', screen: 'product', viewport: { width: 1180, height: 820 }, file: '03-product-config-1180x820.png', heading: 'X-Bacon' },
  { name: 'entrega e cliente', screen: 'delivery', viewport: { width: 1180, height: 820 }, file: '04-delivery-1180x820.png', heading: 'Entrega' },
  { name: 'seleção de mesa', screen: 'table', viewport: { width: 1180, height: 820 }, file: '05-table-1180x820.png', heading: 'Escolha a mesa' },
  { name: 'pagamento', screen: 'payment', viewport: { width: 1180, height: 820 }, file: '06-payment-1180x820.png', heading: 'Revisar e finalizar' },
  { name: 'sucesso', screen: 'success', viewport: { width: 1180, height: 820 }, file: '07-success-1180x820.png', heading: 'Pedido #315 criado' },
  { name: 'kds', screen: 'kds', viewport: { width: 1180, height: 820 }, file: '08-kds-1180x820.png', heading: 'Cozinha' },
  { name: 'fallback mobile', screen: 'pos', viewport: { width: 390, height: 844 }, file: '09-pos-mobile-390x844.png', heading: 'Novo pedido' },
] as const;

for (const item of cases) {
  test(item.name, async ({ page }) => {
    await openPrototype(page, item.screen, item.viewport);
    await expect(page.getByRole('heading', { name: item.heading, exact: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDirectory, item.file) });
  });
}

test('busca local encontra X-Bacon sem round trip', async ({ page }) => {
  await openPrototype(page, 'pos', { width: 1024, height: 768 });
  await page.locator('#product-search').fill('x ba');
  await expect(page.locator('[data-product="x-bacon"]')).toBeVisible();
  await expect(page.locator('[data-product="coca"]')).toBeHidden();
});
