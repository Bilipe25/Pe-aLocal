import { expect, test } from '@playwright/test';

test.describe('experiência pública', () => {
  test('carrega a home e navega para o login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/PedidoLocal/);
    await expect(
      page.getByRole('heading', { level: 1, name: /Sua lanchonete online/ }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    await page.getByRole('link', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar no painel' })).toBeVisible();
  });

  test('formulário de login é operável e associa erros aos campos', async ({ page }) => {
    await page.goto('/login');

    const email = page.getByLabel('E-mail');
    const password = page.getByLabel('Senha', { exact: true });
    const passwordToggle = page.getByRole('button', { name: 'Mostrar senha' });
    const recoveryLink = page.getByRole('link', { name: 'Esqueci minha senha' });

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(email).not.toBeFocused();
    await expect(page.getByText('PedidoLocal', { exact: true })).toHaveCount(1);
    await expect(password).toHaveAttribute('type', 'password');
    await passwordToggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      await recoveryLink.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', 'email-error');
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAttribute('aria-describedby', 'password-error');
    await expect(page.locator('#email-error')).toHaveRole('alert');
    await expect(page.locator('#password-error')).toHaveRole('alert');

    await page.getByRole('button', { name: 'Preencher dados de demonstração' }).click();
    await expect(email).toHaveValue('dono@demo.com');
    await expect(password).toHaveValue('SenhaDemo123!');
    await expect(page.locator('#email-error')).toHaveCount(0);
    await expect(page.locator('#password-error')).toHaveCount(0);
  });

  test('orienta o usuário que ainda não possui acesso à loja', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Preciso de acesso à loja' }).click();

    await expect(page).toHaveURL(/\/access-help$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Como conseguir acesso' }),
    ).toBeVisible();
    await expect(page.getByText('Já acessou antes?')).toBeVisible();
    await expect(page.getByText('É seu primeiro acesso?')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Redefinir minha senha' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  test('mantém o erro de autenticação visível no formulário', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'E-mail ou senha inválidos.' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('E-mail').fill('pessoa@example.com');
    await page.getByLabel('Senha', { exact: true }).fill('SenhaValida123!');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const error = page.locator('#login-form-error');
    await expect(error).toHaveRole('alert');
    await expect(error).toContainText('E-mail ou senha inválidos.');
    await expect(page.locator('form')).toHaveAttribute('aria-describedby', 'login-form-error');
  });

  test('health check responde com o contrato público', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: '0.1.0',
    });
  });
});
