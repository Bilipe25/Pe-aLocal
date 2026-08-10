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
      '/pwa/pedidolocal-icon-v1-192.png',
      '/pwa/pedidolocal-icon-v1-512.png',
      '/pwa/pedidolocal-maskable-v1-512.png',
      '/pwa/apple-touch-icon-v1-180.png',
    ]) {
      const response = await request.get(icon);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('publica manifest relativo e white-label quando há loja E2E', async ({ request }) => {
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
      const cache = await caches.open('pedidolocal-shell-v1');
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
