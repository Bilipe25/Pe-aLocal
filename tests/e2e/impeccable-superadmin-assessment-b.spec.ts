import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const credentials = {
  email: process.env.SEED_SUPER_ADMIN_EMAIL,
  password: process.env.SEED_SUPER_ADMIN_PASSWORD,
};

if (!credentials.email || !credentials.password) {
  throw new Error('SEED_SUPER_ADMIN credentials are unavailable');
}

type Evidence = Record<string, unknown>;

async function inspect(page: import('@playwright/test').Page, route: string, viewport: string) {
  await page.goto(route, { waitUntil: 'networkidle' });

  const structure = await page.evaluate(() => {
    const selectorFor = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      const aria = element.getAttribute('aria-label');
      return `${tag}${role ? `[role="${role}"]` : ''}${aria ? `[aria-label="${aria}"]` : ''}`;
    };
    const interactive = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => {
      const style = getComputedStyle(el);
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && !el.hasAttribute('disabled')
      );
    });
    const smallTargets = interactive
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(
        ({ rect }) => rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44),
      )
      .slice(0, 30)
      .map(({ el, rect }) => ({
        selector: selectorFor(el),
        label: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 80),
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      }));

    return {
      url: location.pathname,
      title: document.title,
      overflow: {
        viewportWidth: innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      },
      headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
        level: Number(h.tagName.slice(1)),
        text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      })),
      landmarks: {
        main: document.querySelectorAll('main,[role="main"]').length,
        nav: Array.from(document.querySelectorAll('nav,[role="navigation"]')).map((n) =>
          n.getAttribute('aria-label'),
        ),
        header: document.querySelectorAll('header,[role="banner"]').length,
        footer: document.querySelectorAll('footer,[role="contentinfo"]').length,
        aside: document.querySelectorAll('aside,[role="complementary"]').length,
      },
      activeNav: Array.from(document.querySelectorAll('nav a[aria-current]')).map((a) => ({
        current: a.getAttribute('aria-current'),
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().replace(/\s+/g, ' '),
      })),
      interactiveCount: interactive.length,
      smallTouchTargetCount: smallTargets.length,
      smallTouchTargets: smallTargets,
    };
  });

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = axe.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    targets: violation.nodes.slice(0, 8).map((node) => node.target.join(' ')),
  }));

  let overlay: Evidence;
  try {
    await page.addScriptTag({ url: 'http://localhost:8400/detect.js' });
    await page.waitForTimeout(2500);
    overlay = await page.evaluate(() => ({
      injected: true,
      scriptPresent: !!document.querySelector('script[src="http://localhost:8400/detect.js"]'),
      impeccableDomNodes: document.querySelectorAll(
        '[id*="impeccable"],[class*="impeccable"],[data-impeccable]',
      ).length,
    }));
  } catch (error) {
    overlay = { injected: false, error: error instanceof Error ? error.message : String(error) };
  }

  return {
    viewport,
    route,
    structure,
    axe: { violationCount: violations.length, violations },
    overlay,
  };
}

test('collect isolated super-admin browser evidence', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: Evidence[] = [];
  const impeccableConsole: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push({ type: 'console', url: page.url(), text: message.text().slice(0, 500) });
    if (/impeccable/i.test(message.text())) impeccableConsole.push(message.text().slice(0, 1000));
  });
  page.on('pageerror', (error) =>
    consoleErrors.push({ type: 'pageerror', url: page.url(), text: error.message.slice(0, 500) }),
  );
  page.on('response', (response) => {
    if (response.status() >= 400)
      consoleErrors.push({ type: 'response', url: response.url(), status: response.status() });
  });

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('E-mail').fill(credentials.email!);
  await page.getByLabel('Senha').fill(credentials.password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/admin(?:\/|$)/, { timeout: 30_000 });

  const originalTitle = await page.title();
  const preflight = await page.evaluate((title) => {
    document.title = `${title} [preflight]`;
    const script = document.createElement('script');
    script.dataset.impeccablePreflight = 'true';
    document.head.appendChild(script);
    const result = {
      titleChanged: document.title.endsWith('[preflight]'),
      scriptAppended: script.isConnected,
    };
    script.remove();
    document.title = title;
    return result;
  }, originalTitle);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop: Evidence[] = [];
  desktop.push(await inspect(page, '/admin', '1440x900'));
  desktop.push(await inspect(page, '/admin/tenants', '1440x900'));
  const firstTenantHref = await page
    .locator('a[href^="/admin/tenants/"]')
    .first()
    .getAttribute('href');
  if (!firstTenantHref) throw new Error('No tenant detail route was available');
  desktop.push(await inspect(page, firstTenantHref, '1440x900'));
  const firstCustomizationHref = await page
    .locator('a[href$="/customization"]')
    .first()
    .getAttribute('href');
  if (!firstCustomizationHref)
    throw new Error('No customization route was available for the first tenant');
  desktop.push(await inspect(page, firstCustomizationHref, '1440x900'));

  await page.setViewportSize({ width: 320, height: 800 });
  const mobile: Evidence[] = [];
  mobile.push(await inspect(page, '/admin', '320x800'));
  mobile.push(await inspect(page, '/admin/tenants', '320x800'));
  mobile.push(await inspect(page, firstTenantHref, '320x800'));
  mobile.push(await inspect(page, firstCustomizationHref, '320x800'));

  console.log(
    'IMPECCABLE_ASSESSMENT_B_JSON=' +
      JSON.stringify({
        context: {
          freshPlaywrightContext: true,
          freshPage: true,
          credentialsSource: '.env.local SEED_SUPER_ADMIN_*',
          credentialsPrinted: false,
        },
        preflight,
        routeTemplates: [
          '/admin',
          '/admin/tenants',
          '/admin/tenants/[id]',
          '/admin/tenants/[id]/stores/[storeId]/customization',
        ],
        resolvedRoutes: { firstTenantHref, firstCustomizationHref },
        desktop,
        mobile,
        impeccableConsole,
        consoleErrors,
      }),
  );
});
