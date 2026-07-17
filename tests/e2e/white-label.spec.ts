import { expect, test } from '@playwright/test';

import { credentialsFromEnv, loginAs } from './helpers';

const superAdmin = credentialsFromEnv('SUPER_ADMIN');
const owner = credentialsFromEnv('OWNER');
const tenantId = process.env.E2E_TENANT_ID;
const storeId = process.env.E2E_STORE_ID;
const storeSlug = process.env.E2E_STORE_SLUG;
const adminEnvironmentReady = Boolean(superAdmin && tenantId && storeId && storeSlug);
const customizationPath = `/admin/tenants/${tenantId}/stores/${storeId}/customization`;

test.describe('white-label protegido', () => {
  test('SUPER_ADMIN entra em /admin e navega até a personalização da loja', async ({ page }) => {
    test.skip(!adminEnvironmentReady, 'Credenciais e escopo E2E não foram configurados.');

    await loginAs(page, superAdmin!);
    await expect(page).toHaveURL(/\/admin(?:\/?|\?.*)$/);
    await page.goto(`/admin/tenants/${tenantId}`);
    await page.getByRole('link', { name: /Personalização/ }).click();

    await expect(page).toHaveURL(customizationPath);
    await expect(page.getByRole('heading', { name: 'Prévia responsiva' })).toBeVisible();
    await page.getByRole('button', { name: 'Tablet' }).click();
    await expect(page.locator('[data-preview-mode="tablet"]')).toBeVisible();
  });

  test('OWNER não acessa a área administrativa', async ({ page }) => {
    test.skip(!owner, 'Credenciais E2E de OWNER não foram configuradas.');

    await loginAs(page, owner!);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/access-denied$/);
    await expect(page.getByRole('heading', { name: /acesso negado/i })).toBeVisible();
  });
});

test.describe.serial('publicação white-label reversível', () => {
  test('draft fica privado, publicação atualiza o público e restauração cria novo draft', async ({
    browser,
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Mutação executada uma única vez no Chromium.');
    test.skip(!adminEnvironmentReady, 'Credenciais e escopo E2E não foram configurados.');
    test.skip(
      process.env.E2E_ALLOW_MUTATIONS !== 'true',
      'Defina E2E_ALLOW_MUTATIONS=true somente para uma loja de teste dedicada.',
    );

    await loginAs(page, superAdmin!);
    await page.goto(customizationPath);

    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`/${storeSlug}`);
    const publicTheme = publicPage.locator('.storefront-theme');
    const originalPublicClass = (await publicTheme.getAttribute('class')) ?? '';

    const layoutSelect = page.getByLabel('Estrutura');
    const originalLayout = await layoutSelect.inputValue();
    const alternateLayout = originalLayout === 'MODERN_GRID' ? 'CLASSIC_LIST' : 'MODERN_GRID';

    await layoutSelect.selectOption(alternateLayout);
    await expect(page.locator('[data-preview-layout]')).toHaveAttribute(
      'data-preview-layout',
      alternateLayout,
    );
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByText('Rascunho salvo com segurança.')).toBeVisible();

    await publicPage.reload();
    await expect(publicTheme).toHaveAttribute('class', originalPublicClass);

    await page.getByLabel('Motivo da publicação ou restauração').fill('Teste E2E reversível');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Personalização publicada.')).toBeVisible();

    await publicPage.reload();
    await expect(publicTheme).toHaveClass(
      new RegExp(`storefront-layout-${alternateLayout.toLowerCase().replaceAll('_', '-')}`),
    );

    await page.getByLabel('Estrutura').selectOption(originalLayout);
    await page.getByRole('button', { name: 'Salvar rascunho' }).click();
    await expect(page.getByText('Rascunho salvo com segurança.')).toBeVisible();
    await page.getByLabel('Motivo da publicação ou restauração').fill('Rollback automático do E2E');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Personalização publicada.')).toBeVisible();

    await publicPage.reload();
    await expect(publicTheme).toHaveAttribute('class', originalPublicClass);

    await page
      .getByLabel('Motivo da publicação ou restauração')
      .fill('Validação de restauração E2E');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Restaurar como rascunho' }).first().click();
    await expect(page.getByText(/restaurada como rascunho/)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Descartar rascunho' }).click();
    await expect(page.getByText('Rascunho descartado.')).toBeVisible();
    await publicContext.close();
  });
});
