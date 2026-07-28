import { expect, type Page, test } from '@playwright/test';

import { chooseRequiredOptionsInProductDialog, mutationsAllowed } from './helpers';

const storeSlug = process.env.E2E_STORE_SLUG;
const coveredPostalCode = process.env.E2E_DELIVERY_POSTAL_CODE;
const outsidePostalCode = process.env.E2E_OUTSIDE_DELIVERY_POSTAL_CODE;
const couponCode = process.env.E2E_COUPON_CODE;
const expiredOrderToken = process.env.E2E_EXPIRED_ORDER_TRACKING_TOKEN;

async function addFirstAvailableProduct(page: Page) {
  await page.goto(`/${storeSlug}`);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key === 'pedidolocal-cart' || key.startsWith('pedidolocal-cart:')) {
        localStorage.removeItem(key);
      }
    }
  });
  await page.reload();

  const productCard = page.locator('.storefront-product-card:not(:disabled)').first();
  if ((await productCard.count()) === 0) return false;
  await productCard.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await chooseRequiredOptionsInProductDialog(page);

  const addButton = page.getByRole('button', { name: /Adicionar/ });
  if (await addButton.isDisabled()) return false;
  await addButton.click();
  await expect(page.getByText('Adicionado à sacola')).toBeVisible();
  await page.goto(`/${storeSlug}/cart`);
  await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
  return true;
}

async function reachReviewForPickup(page: Page) {
  const checkoutLink = page.getByRole('link', { name: /Ir para checkout/ });
  if ((await checkoutLink.count()) === 0 || (await checkoutLink.getAttribute('aria-disabled'))) {
    return false;
  }
  await checkoutLink.click();

  await expect(page.getByRole('heading', { name: 'Como podemos chamar você?' })).toBeVisible();
  await page.getByLabel('Nome').fill('Cliente E2E');
  await page.getByLabel('Telefone / WhatsApp').fill('(85) 99999-9999');
  await page.getByRole('button', { name: 'Continuar para recebimento' }).click();

  const pickup = page.getByRole('button', { name: 'Retirada', exact: true });
  if ((await pickup.count()) === 0) return false;
  await pickup.click();
  await page.getByRole('button', { name: 'Continuar para pagamento' }).click();

  const pix = page.getByRole('radio', { name: /Pix/ });
  const card = page.getByRole('radio', { name: /Cartão na entrega/ });
  const cash = page.getByRole('radio', { name: /Dinheiro/ });
  if ((await pix.count()) > 0) {
    await pix.check();
  } else if ((await card.count()) > 0) {
    await card.check();
  } else if ((await cash.count()) > 0) {
    await cash.check();
    await page.getByLabel('Sem troco').check();
  } else {
    return false;
  }

  await page.getByRole('button', { name: 'Revisar pedido' }).click();
  await expect(page.getByRole('heading', { name: 'Revise antes de confirmar' })).toBeVisible();
  return true;
}

test.describe.serial('carrinho e checkout v2', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!storeSlug, 'E2E_STORE_SLUG não foi configurado.');
    await page.setViewportSize({ width: 320, height: 720 });
  });

  test('mantém o fluxo compacto, responsivo e navegável até a revisão', async ({ page }) => {
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');

    await expect(page.getByRole('button', { name: 'Sobre a loja' })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    test.skip(!(await reachReviewForPickup(page)), 'Retirada ou pagamento não configurado.');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('heading', { name: 'Resumo do pedido' }).last()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  test('resolve cobertura por CEP sem aceitar zona escolhida pelo navegador', async ({ page }) => {
    test.skip(!coveredPostalCode || !outsidePostalCode, 'CEPs E2E não foram configurados.');
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');

    const delivery = page.getByRole('button', { name: /^Entrega/ });
    test.skip((await delivery.count()) === 0, 'A loja E2E não oferece entrega.');
    await delivery.click();

    const postalInput = page.getByLabel('CEP para entrega');
    await postalInput.fill(outsidePostalCode!);
    await expect(page.getByText(/não está na área de entrega/i)).toBeVisible();

    await postalInput.fill(coveredPostalCode!);
    await expect(page.getByText(/Entrega disponível/i)).toBeVisible();
  });

  test('aplica cupom pertencente à loja antes do checkout', async ({ page }) => {
    test.skip(!couponCode, 'E2E_COUPON_CODE não foi configurado.');
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');

    await page.getByLabel('Código do cupom').fill(couponCode!);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: couponCode! })).toContainText(
      /de desconto/i,
    );
  });

  test('rejeita cupom inexistente sem alterar o total autoritativo', async ({ page }) => {
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');

    await page.getByLabel('Código do cupom').fill('CUPOM-INEXISTENTE-E2E');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Este cupom não está disponível para este pedido.',
    );
  });

  test('exige revisão explícita quando o fingerprint da cotação muda', async ({ page }) => {
    test.skip(
      !mutationsAllowed(),
      'Use E2E_ALLOW_MUTATIONS=true somente em uma loja descartável de staging.',
    );
    await page.route(`**/api/storefront/${storeSlug}/checkout/quote`, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      if (response.ok()) body.quoteFingerprint = '0'.repeat(64);
      await route.fulfill({ response, json: body });
    });

    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await reachReviewForPickup(page)), 'Retirada ou pagamento não configurado.');

    await page.getByRole('button', { name: /Confirmar ·/ }).click();
    await expect(page.getByRole('alert')).toContainText('O pedido mudou antes da confirmação');
    await expect(
      page.getByRole('button', { name: 'Aceitar nova cotação e revisar' }),
    ).toBeVisible();
  });

  test('não serializa a comanda quando o token público expirou', async ({ page }) => {
    test.skip(!expiredOrderToken, 'E2E_EXPIRED_ORDER_TRACKING_TOKEN não foi configurado.');
    await page.goto(`/${storeSlug}/order/${expiredOrderToken}`);

    await expect(page.getByRole('heading', { name: 'Acompanhamento indisponível' })).toBeVisible();
    await expect(page.getByText('Itens do pedido')).toHaveCount(0);
    await expect(page.getByText(/Pedido #\d+/)).toHaveCount(0);
  });
});
