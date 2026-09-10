import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Read-only server fixture: an existing store with an active fixed combo. No order is submitted.
const storeSlug = process.env.E2E_OFFERS_STORE_SLUG;
const comboName = process.env.E2E_OFFERS_COMBO_NAME ?? 'Combo XIS';
const componentFixture = process.env.E2E_OFFERS_COMPONENT_FIXTURE === 'true';

test.describe(
  componentFixture ? 'componentes reais de ofertas — fixture isolada' : 'ofertas na aplicação real',
  () => {
    test.skip(
      !storeSlug && !componentFixture,
      'Defina E2E_OFFERS_STORE_SLUG para uma loja de testes com combo ativo.',
    );

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 390, height: 844 },
      { width: 768, height: 600 },
      { width: 1280, height: 720 },
    ]) {
      test(`imagem, rolagem e controles alcançáveis em ${viewport.width}×${viewport.height}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.goto(componentFixture ? '/' : `/${storeSlug}`);
        const section = page.getByRole('region', { name: 'Ofertas', exact: true });
        const offer = section
          .getByRole('button')
          .filter({ has: page.getByRole('heading', { name: comboName, exact: true }) });
        await expect(offer).toBeVisible();
        const frame = offer.locator('.storefront-product-image-frame');
        await expect(frame).toBeVisible();
        const frameBox = await frame.boundingBox();
        expect(frameBox!.height).toBeGreaterThan(80);
        expect(frameBox!.width).toBeGreaterThan(80);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        await offer.scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(`offers-${viewport.width}.png`) });

        await offer.click();
        const dialog = page.getByRole('dialog', { name: comboName, exact: true });
        const add = dialog.getByRole('button', { name: /Adicionar/ });
        await expect(add).toBeVisible();
        const geometry = await dialog.evaluate((element) => {
          const scroll = element.querySelector<HTMLElement>('.storefront-product-modal-scroll')!;
          const cta = element.querySelector<HTMLElement>('.storefront-product-modal-cta')!;
          const close = element.querySelector<HTMLElement>('.storefront-product-modal-close')!;
          const ctaRect = cta.getBoundingClientRect();
          const closeRect = close.getBoundingClientRect();
          return {
            overflow: getComputedStyle(scroll).overflowY,
            insideScroll: scroll.contains(cta),
            ctaTop: ctaRect.top,
            ctaBottom: ctaRect.bottom,
            ctaHeight: ctaRect.height,
            closeBottom: closeRect.bottom,
            height: innerHeight,
          };
        });
        expect(geometry.overflow).toBe('auto');
        expect(geometry.insideScroll).toBe(false);
        expect(geometry.ctaTop).toBeGreaterThanOrEqual(0);
        expect(geometry.ctaBottom).toBeLessThanOrEqual(geometry.height);
        expect(geometry.ctaHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.closeBottom).toBeLessThanOrEqual(geometry.height);
        for (const control of await dialog
          .getByRole('group', { name: 'Quantidade de combos' })
          .getByRole('button')
          .all()) {
          const box = await control.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        const notes = dialog.getByRole('textbox').last();
        if (await notes.count()) {
          await notes.fill('Teste local de rolagem; nenhum pedido será enviado.');
          await expect(add).toBeInViewport();
        }
        await page.screenshot({ path: testInfo.outputPath(`combo-${viewport.width}.png`) });
        const accessibility = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(accessibility.violations).toEqual([]);
        await dialog.getByRole('button', { name: `Fechar configuração de ${comboName}` }).click();
        await expect(dialog).not.toBeVisible();
        await expect(offer).toBeFocused();
      });
    }
  },
);
