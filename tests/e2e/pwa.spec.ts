import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test('publica manifest global, SW e ícones versionados', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
    expect(await manifestResponse.json()).toMatchObject({
      name: 'PedidoLocal',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });

    const swResponse = await request.get('/sw.js');
    expect(swResponse.ok()).toBe(true);
    expect(swResponse.headers()['cache-control']).toMatch(/no-cache|no-store/);

    for (const icon of [
      { url: '/pwa/pedidolocal-icon-v1-192.png', size: 192 },
      { url: '/pwa/pedidolocal-icon-v1-512.png', size: 512 },
      { url: '/pwa/pedidolocal-maskable-v1-512.png', size: 192 },
      { url: '/pwa/apple-touch-icon-v1-180.png', size: 180 },
    ]) {
      const response = await request.get(icon.url);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
      const png = await response.body();
      expect(png.readUInt32BE(16)).toBe(icon.size);
      expect(png.readUInt32BE(20)).toBe(icon.size);
    }
  });

  test('publica manifest e metadados white-label quando há loja E2E', async ({ request, page }) => {
    const storeSlug = process.env.E2E_STORE_SLUG;
    test.skip(!storeSlug, 'E2E_STORE_SLUG não foi configurado.');

    const response = await request.get(`/${storeSlug}/manifest.webmanifest`, {
      headers: { Host: 'dominio-alternativo.test' },
    });
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest.start_url).toBe(`/${storeSlug}`);
    expect(manifest.scope).toBe(`/${storeSlug}`);
    expect(manifest.id).toMatch(/^\/pwa\/store\//);
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: expect.stringContaining('variant=pwa-any-192'),
        sizes: '192x192',
      }),
      expect.objectContaining({
        src: expect.stringContaining('variant=pwa-any-512'),
        sizes: '512x512',
      }),
      expect.objectContaining({
        src: expect.stringContaining('variant=pwa-maskable-512'),
        purpose: 'maskable',
      }),
    ]);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok()).toBe(true);
      expect(iconResponse.headers()['content-type']).toContain('image/png');
      const png = await iconResponse.body();
      const expectedSize = Number(icon.sizes.split('x')[0]);
      expect(png.readUInt32BE(16)).toBe(expectedSize);
      expect(png.readUInt32BE(20)).toBe(expectedSize);
    }

    await page.goto(`/${storeSlug}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      `/${storeSlug}/manifest.webmanifest`,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      manifest.theme_color,
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      /variant=pwa-apple-180/,
    );
  });

  test('fallback offline não expõe HTML stale e cache contém só shell explícito', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'workerd-chromium' &&
        process.env.E2E_USE_PRODUCTION_BUILD !== 'true',
      'Registro do SW é intencionalmente desativado em next dev.',
    );

    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
      await page.reload();
    }

    const cacheEntries = await page.evaluate(async () => {
      const cache = await caches.open('pedidolocal-shell-v2');
      return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
    });
    expect(cacheEntries).toEqual(
      [
        '/offline',
        '/pwa/apple-touch-icon-v1-180.png',
        '/pwa/pedidolocal-icon-v1-192.png',
        '/pwa/pedidolocal-icon-v1-512.png',
        '/pwa/pedidolocal-maskable-v1-512.png',
      ].sort(),
    );

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Você está offline' })).toBeVisible();
    await context.setOffline(false);
  });
});
