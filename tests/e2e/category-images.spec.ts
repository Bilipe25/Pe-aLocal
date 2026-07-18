import { expect, test } from '@playwright/test';

import { credentialsFromEnv, loginAs } from './helpers';

const superAdmin = credentialsFromEnv('SUPER_ADMIN');
const tenantId = process.env.E2E_TENANT_ID;
const storeId = process.env.E2E_STORE_ID;
const storeSlug = process.env.E2E_STORE_SLUG;
const categoryName = process.env.E2E_CATEGORY_NAME;
const categoryImagePath = process.env.E2E_CATEGORY_IMAGE_PATH;
const customizationPath = `/admin/tenants/${tenantId}/stores/${storeId}/customization`;
const environmentReady = Boolean(
  superAdmin && tenantId && storeId && storeSlug && categoryName && categoryImagePath,
);

test.describe.serial('imagens de categoria white-label', () => {
  test('upload fica privado até publicar e o toggle preserva a associação', async ({
    browser,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Mutação executada uma única vez no Chromium.');
    test.skip(!environmentReady, 'Credenciais, categoria e imagem E2E não foram configuradas.');
    test.skip(
      process.env.E2E_ALLOW_MUTATIONS !== 'true',
      'Use E2E_ALLOW_MUTATIONS=true somente em uma loja de teste dedicada.',
    );

    await loginAs(page, superAdmin!);
    await page.goto(customizationPath);
    const toggle = page.getByLabel('Exibir imagens das categorias no cardápio');
    if (!(await toggle.isChecked())) await toggle.check();

    const categoryRow = page.locator('article').filter({ hasText: categoryName! }).first();
    await categoryRow.getByLabel('Enviar nova imagem').setInputFiles(categoryImagePath!);
    await categoryRow
      .getByLabel('Texto alternativo')
      .fill(`Imagem representando a categoria ${categoryName}`);
    const uploadResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().endsWith('/assets'),
    );
    await categoryRow.getByRole('button', { name: 'Enviar e associar' }).click();
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = (await uploadResponse.json()) as { asset: { id: string } };
    const publicCategoryImage = `img[src*="${uploadBody.asset.id}"]`;
    await expect(page.getByText(/Imagem enviada e associada ao rascunho/)).toBeVisible();

    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByText('Rascunho salvo com segurança.')).toBeVisible();

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/${storeSlug}`);
    await expect(publicPage.locator(publicCategoryImage)).toHaveCount(0);

    await page
      .getByLabel('Motivo da publicação ou restauração')
      .fill('Publicar imagem de categoria no E2E');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Personalização publicada.')).toBeVisible();
    await publicPage.reload();
    await expect(publicPage.locator(publicCategoryImage)).toBeVisible();

    await toggle.uncheck();
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page.getByLabel('Motivo da publicação ou restauração').fill('Ocultar imagens no E2E');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await publicPage.reload();
    await expect(publicPage.locator('.storefront-category-thumbnail')).toHaveCount(0);

    await toggle.check();
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await page
      .getByLabel('Motivo da publicação ou restauração')
      .fill('Reativar imagens preservadas no E2E');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await publicPage.reload();
    await expect(publicPage.locator(publicCategoryImage)).toBeVisible();
    await publicContext.close();
  });
});
