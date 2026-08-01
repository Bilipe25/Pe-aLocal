import { expect, test } from '@playwright/test';

import {
  chooseRequiredOptionsInProductDialog,
  credentialsFromEnv,
  loginAs,
  mutationsAllowed,
} from './helpers';

const storeSlug = process.env.E2E_STORE_SLUG;
const owner = credentialsFromEnv('OWNER');

test.describe.serial('compra publica e acompanhamento', () => {
  test('cliente cria retirada, acompanha e operador conclui o fluxo', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('chromium'), 'Pedido mutavel roda uma unica vez.');
    test.skip(!storeSlug, 'E2E_STORE_SLUG nao foi configurado.');
    test.skip(!owner, 'Credenciais E2E de OWNER nao foram configuradas.');
    test.skip(
      !mutationsAllowed(),
      'Defina E2E_ALLOW_MUTATIONS=true somente para uma loja descartavel de teste.',
    );

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
    await page.getByRole('link', { name: /Continuar para o checkout/ }).click();

    await expect(page.getByRole('heading', { name: 'Vamos identificar você' })).toBeVisible();
    await page.getByLabel('Celular').fill('(85) 99999-9999');
    await page.getByLabel('Nome').fill('Cliente E2E');
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
    const pickup = page.getByRole('button', { name: 'Retirada', exact: true });
    test.skip((await pickup.count()) === 0, 'A loja E2E não oferece retirada.');
    await pickup.click();
    await page.getByRole('button', { name: 'Continuar para pagamento' }).click();

    await expect(page.getByRole('heading', { name: 'Como prefere pagar?' })).toBeVisible();
    const pix = page.getByRole('radio', { name: /Pix/ });
    const cash = page.getByRole('radio', { name: /Dinheiro/ });
    const card = page.getByRole('radio', { name: /Cartão na entrega/ });
    if ((await pix.count()) > 0) {
      await pix.check();
    } else if ((await cash.count()) > 0) {
      await cash.check();
      await page.getByLabel('Sem troco').check();
    } else if ((await card.count()) > 0) {
      await card.check();
    } else {
      test.skip(true, 'A loja E2E não possui forma de pagamento pública.');
    }

    await page.getByRole('button', { name: 'Revisar pedido' }).click();
    await expect(page.getByRole('heading', { name: 'Revise antes de confirmar' })).toBeVisible();

    let submittedAction: { url: string; headers: Record<string, string>; body: Buffer } | undefined;
    page.on('request', (request) => {
      const body = request.postDataBuffer();
      if (
        !submittedAction &&
        request.method() === 'POST' &&
        request.headers()['next-action'] &&
        body
      ) {
        submittedAction = {
          url: request.url(),
          headers: request.headers(),
          body,
        };
      }
    });

    const submit = page.getByRole('button', { name: /Confirmar ·/ });
    test.skip(await submit.isDisabled(), 'Pedido E2E nao atingiu minimo ou forma de pagamento.');
    await submit.click();

    await expect(page).toHaveURL(new RegExp(`/${storeSlug}/order/[^/]+$`));
    await expect(page.getByRole('heading', { name: 'Acompanhar Pedido' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pedido recebido' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
    await expect(page.getByText('Itens do pedido')).toBeVisible();

    const token = new URL(page.url()).pathname.split('/').at(-1);
    expect(token).toBeTruthy();
    expect(submittedAction).toBeDefined();
    if (!submittedAction) throw new Error('A requisição de criação do pedido não foi capturada.');

    const replayHeaders = { ...submittedAction.headers };
    delete replayHeaders['content-length'];
    delete replayHeaders.cookie;
    delete replayHeaders.host;
    const replay = await page.request.fetch(submittedAction.url, {
      method: 'POST',
      headers: replayHeaders,
      data: submittedAction.body,
    });
    expect(replay.ok()).toBe(true);
    expect(await replay.text()).toContain(token!);

    const trackingResponse = await page.evaluate(
      async ({ publicToken, slug }) => {
        const response = await fetch(
          `/api/orders/track/${encodeURIComponent(publicToken!)}?storeSlug=${encodeURIComponent(slug!)}`,
          { cache: 'no-store' },
        );
        return {
          status: response.status,
          cacheControl: response.headers.get('cache-control'),
          body: (await response.json()) as Record<string, unknown>,
        };
      },
      { publicToken: token, slug: storeSlug },
    );
    expect(trackingResponse.status).toBe(200);
    expect(trackingResponse.cacheControl).toContain('no-store');
    expect(Object.keys(trackingResponse.body).sort()).toEqual(
      [
        'cancellationMessage',
        'estimate',
        'modality',
        'orderNumber',
        'paymentStatus',
        'status',
        'statusChangedAt',
        'updatedAt',
        'version',
      ].sort(),
    );
    expect(JSON.stringify(trackingResponse.body)).not.toMatch(
      /Cliente E2E|99999-9999|customerPhone|deliveryAddress|orderId|internal/i,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${storeSlug}`);
    await page.getByRole('button', { name: 'Meu pedido' }).click();
    await expect(page).toHaveURL(new RegExp(`/${storeSlug}/order/${token}$`));

    const orderLabel = await page
      .getByText(/^Pedido #\d+$/)
      .first()
      .textContent();
    const orderNumber = orderLabel?.match(/\d+/)?.[0];
    expect(orderNumber).toBeTruthy();

    const operatorPage = await page.context().newPage();
    await operatorPage.setViewportSize({ width: 390, height: 844 });
    await loginAs(operatorPage, owner!);

    async function advanceOrder(actionName: string, customerStatus: string, confirmation = false) {
      await operatorPage.goto('/dashboard/orders');
      await operatorPage
        .getByRole('searchbox', { name: 'Buscar na central de pedidos' })
        .fill(`#${orderNumber}`);
      const card = operatorPage.getByRole('button', {
        name: new RegExp(`Abrir pedido ${orderNumber},`),
      });
      await expect(card).toBeVisible();
      await card.click();
      const details = operatorPage.getByRole('dialog').first();
      await expect(details).toBeVisible();
      await details.getByRole('button', { name: actionName, exact: true }).click();
      if (confirmation) {
        const confirmationDialog = operatorPage.getByRole('dialog').last();
        await confirmationDialog.getByRole('button', { name: actionName, exact: true }).click();
      }
      await expect(details).toBeHidden();

      await page.getByRole('button', { name: 'Atualizar' }).click();
      await expect(page.getByRole('heading', { name: customerStatus })).toBeVisible();
    }

    await advanceOrder('Aceitar Pedido', 'Pedido confirmado');
    await advanceOrder('Iniciar Preparo', 'Em preparo');
    await advanceOrder('Marcar como pronto', 'Pedido pronto');
    await advanceOrder('Concluir pedido', 'Pedido concluído', true);
    await operatorPage.close();
  });
});
