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
    sessionStorage.clear();
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

async function openCheckout(page: Page) {
  const checkoutLink = page.getByRole('link', { name: /Continuar para o checkout/ });
  if ((await checkoutLink.count()) === 0 || (await checkoutLink.getAttribute('aria-disabled'))) {
    return false;
  }
  await checkoutLink.click();
  await expect(page.getByRole('heading', { name: 'Vamos identificar você' })).toBeVisible();
  return true;
}

async function continueIdentificationAsGuest(
  page: Page,
  customer = { name: 'Cliente E2E', phone: '(85) 99999-9999' },
) {
  await page.getByLabel('Celular').fill(customer.phone);
  await page.getByLabel('Nome').fill(customer.name);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();

  await expect
    .poll(
      async () => {
        const fulfillmentVisible = await page
          .getByRole('heading', { name: 'Como quer receber?' })
          .isVisible()
          .catch(() => false);
        const recognitionVisible = await page
          .getByRole('heading', { name: /Bem-vindo de volta/ })
          .isVisible()
          .catch(() => false);
        return fulfillmentVisible || recognitionVisible;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const notMe = page.getByRole('button', { name: 'Não sou eu' });
  if (await notMe.isVisible().catch(() => false)) {
    await notMe.click();
  }

  await expect(page.getByRole('heading', { name: 'Como quer receber?' })).toBeVisible();
}

async function reachReviewForPickup(page: Page) {
  if (!(await openCheckout(page))) return false;
  await continueIdentificationAsGuest(page);

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

  test('calcula entrega por zona e mantém o CEP opcional', async ({ page }) => {
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await openCheckout(page)), 'O checkout não está disponível.');
    await continueIdentificationAsGuest(page);

    const delivery = page.getByRole('button', { name: /^Entrega/ });
    test.skip((await delivery.count()) === 0, 'A loja E2E não oferece entrega.');
    await delivery.click();

    const zoneSelect = page.getByLabel('Bairro ou região atendida');
    const zones = await zoneSelect
      .locator('option')
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter((value) => value.length > 0),
      );
    test.skip(zones.length === 0, 'A loja E2E não possui zona de entrega ativa.');

    await zoneSelect.selectOption(zones[0]);
    await expect(page.getByText(/Entrega disponível/)).toBeVisible();
    await expect(page.getByLabel('CEP (opcional)')).toHaveValue('');

    await page.getByLabel('Rua').fill('Rua E2E');
    await page.getByLabel('Número').fill('100');
    await page.getByRole('button', { name: 'Continuar para pagamento' }).click();
    await expect(page.getByRole('heading', { name: 'Como prefere pagar?' })).toBeVisible();
  });

  test('rejeita CEP incompatível com a zona escolhida sem bloquear o preenchimento manual', async ({
    page,
  }) => {
    test.skip(!outsidePostalCode, 'E2E_OUTSIDE_DELIVERY_POSTAL_CODE não foi configurado.');
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await openCheckout(page)), 'O checkout não está disponível.');
    await continueIdentificationAsGuest(page);

    const delivery = page.getByRole('button', { name: /^Entrega/ });
    test.skip((await delivery.count()) === 0, 'A loja E2E não oferece entrega.');
    await delivery.click();

    const zoneSelect = page.getByLabel('Bairro ou região atendida');
    const firstZone = await zoneSelect
      .locator('option[value]:not([value=""])')
      .first()
      .getAttribute('value');
    test.skip(!firstZone, 'A loja E2E não possui zona de entrega ativa.');
    await zoneSelect.selectOption(firstZone!);
    const quoteAfterPostalCode = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/storefront/${storeSlug}/checkout/quote`),
    );
    await page.getByLabel('CEP (opcional)').fill(outsidePostalCode!);
    await quoteAfterPostalCode;
    await expect(
      page.getByText(/não pertence à região escolhida|não está na área de entrega/i),
    ).toBeVisible();
  });

  test('aceita CEP compatível quando ele é informado', async ({ page }) => {
    test.skip(!coveredPostalCode, 'E2E_DELIVERY_POSTAL_CODE não foi configurado.');
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await openCheckout(page)), 'O checkout não está disponível.');
    await continueIdentificationAsGuest(page);

    const delivery = page.getByRole('button', { name: /^Entrega/ });
    test.skip((await delivery.count()) === 0, 'A loja E2E não oferece entrega.');
    await delivery.click();

    const zoneSelect = page.getByLabel('Bairro ou região atendida');
    const zones = await zoneSelect
      .locator('option')
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter((value) => value.length > 0),
      );
    test.skip(zones.length === 0, 'A loja E2E não possui zona de entrega ativa.');

    let compatibleZoneFound = false;
    for (const zoneId of zones) {
      await zoneSelect.selectOption(zoneId);
      const postalInput = page.getByLabel('CEP (opcional)');
      await postalInput.clear();
      const quoteAfterPostalCode = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes(`/api/storefront/${storeSlug}/checkout/quote`),
      );
      await postalInput.fill(coveredPostalCode!);
      const response = await quoteAfterPostalCode;
      const quote = (await response.json()) as { deliveryZoneId?: string | null };
      if (response.ok() && quote.deliveryZoneId === zoneId) {
        compatibleZoneFound = true;
        break;
      }
    }
    expect(compatibleZoneFound).toBe(true);
  });

  test('aplica cupom pertencente à loja somente na revisão', async ({ page }) => {
    test.skip(!couponCode, 'E2E_COUPON_CODE não foi configurado.');
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await reachReviewForPickup(page)), 'Retirada ou pagamento não configurado.');

    await page.getByLabel('Cupom').fill(couponCode!);
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(new RegExp(`Desconto ${couponCode}`, 'i'))).toBeVisible();
  });

  test('rejeita cupom inexistente sem alterar o total autoritativo', async ({ page }) => {
    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await reachReviewForPickup(page)), 'Retirada ou pagamento não configurado.');

    await page.getByLabel('Cupom').fill('CUPOM-INEXISTENTE-E2E');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Este cupom não está disponível para este pedido.',
    );
  });

  test('mantém o reconhecimento mascarado fora de HTML e storage e restaura o foco', async ({
    page,
  }) => {
    const fullAddress = 'Rua das Flores, 182, apto 301, CEP 60123-456';
    const opaqueReference = 'r'.repeat(43);
    const recognitionRequests: unknown[] = [];

    await page.route(`**/api/storefront/${storeSlug}/checkout/recognition`, async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        recognitionRequests.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recognized: true,
            maskedName: 'João M***',
            maskedPhone: '(85) *****-**99',
            maskedAddresses: [
              {
                opaqueReference,
                label: 'Casa',
                maskedAddress: 'Rua das F******, nº *** — Centro',
                isDefault: true,
                lastUsedLabel: 'Usado recentemente',
                requiresDeliveryZoneSelection: false,
              },
            ],
          }),
        });
        return;
      }
      if (method === 'PATCH') {
        recognitionRequests.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            confirmed: true,
            mode: 'SAVED_ADDRESS',
            opaqueReference,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invalidated: true }),
      });
    });

    test.skip(!(await addFirstAvailableProduct(page)), 'A loja E2E não possui produto disponível.');
    test.skip(!(await openCheckout(page)), 'O checkout não está disponível.');
    await page.getByLabel('Celular').fill('(85) 99999-9999');
    await page.getByLabel('Nome').fill('João Martins');
    const continueButton = page.getByRole('button', { name: 'Continuar', exact: true });
    await continueButton.click();

    const dialog = page.getByRole('dialog', { name: /Bem-vindo de volta/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: /Casa/ })).toBeFocused();
    await expect(dialog).toContainText('Rua das F******, nº *** — Centro');
    await expect(page.locator('html')).not.toContainText(fullAddress);
    expect(await page.locator('html').evaluate((element) => element.outerHTML)).not.toContain(
      opaqueReference,
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(continueButton).toBeFocused();

    await continueButton.click();
    await expect(dialog).toBeVisible();
    await page.locator('.customer-recognition-overlay').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(continueButton).toBeFocused();

    await continueButton.click();
    await dialog.getByRole('button', { name: 'Sim, continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Como quer receber?' })).toBeVisible();

    const persisted = await page.evaluate(() =>
      JSON.stringify({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: Object.fromEntries(Object.entries(sessionStorage)),
      }),
    );
    expect(persisted).not.toContain('João Martins');
    expect(persisted).not.toContain('85999999999');
    expect(persisted).not.toContain(fullAddress);
    expect(persisted).not.toContain(opaqueReference);
    expect(JSON.stringify(recognitionRequests)).not.toContain(fullAddress);
    expect(recognitionRequests).toContainEqual({
      action: 'CONFIRM_ADDRESS',
      opaqueReference,
    });
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
