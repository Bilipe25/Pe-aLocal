import { expect, test } from '@playwright/test';

import { chooseRequiredOptionsInProductDialog, mutationsAllowed } from './helpers';

const storeSlug = process.env.E2E_STORE_SLUG;

test.describe.serial('compra publica e acompanhamento', () => {
  test('cliente cria pedido de retirada e abre a pagina de acompanhamento', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Pedido mutavel roda uma unica vez.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG nao foi configurado.');
    test.skip(
      !mutationsAllowed(),
      'Defina E2E_ALLOW_MUTATIONS=true somente para uma loja descartavel de teste.',
    );

    await page.goto(`/${storeSlug}`);
    await page.evaluate(() => localStorage.removeItem('pedidolocal-cart'));
    await page.reload();

    const productCard = page.locator('.storefront-product-card:not(:disabled)').first();
    test.skip((await productCard.count()) === 0, 'A loja E2E nao possui produto disponivel.');

    await productCard.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await chooseRequiredOptionsInProductDialog(page);

    const addButton = page.getByRole('button', { name: /Adicionar/ });
    test.skip(await addButton.isDisabled(), 'A loja E2E nao esta aceitando pedidos agora.');
    await addButton.click();
    await expect(page.getByText('Adicionado à sacola')).toBeVisible();

    await page.goto(`/${storeSlug}/cart`);
    await expect(page.getByRole('heading', { name: 'Sua sacola' })).toBeVisible();
    await page.getByRole('link', { name: 'Continuar pedido' }).click();

    await expect(page.getByRole('heading', { name: 'Finalizar pedido' })).toBeVisible();
    const pickup = page.getByRole('button', { name: /Retirada/ });
    if ((await pickup.count()) > 0) await pickup.click();

    await page.getByLabel('Nome').fill('Cliente E2E');
    await page.getByLabel('Telefone / WhatsApp').fill('(85) 99999-9999');

    const cash = page.getByText('Dinheiro', { exact: false });
    const card = page.getByText('Cartão na entrega', { exact: false });
    if ((await cash.count()) > 0) {
      await cash.first().click();
    } else if ((await card.count()) > 0) {
      await card.first().click();
    }

    const submit = page.getByRole('button', { name: /Confirmar pedido/ });
    test.skip(await submit.isDisabled(), 'Pedido E2E nao atingiu minimo ou forma de pagamento.');
    await submit.click();

    await expect(page).toHaveURL(new RegExp(`/${storeSlug}/order/[^/]+$`));
    await expect(page.getByRole('heading', { name: 'Acompanhar Pedido' })).toBeVisible();
    await expect(page.getByText('Itens do pedido')).toBeVisible();
  });
});
