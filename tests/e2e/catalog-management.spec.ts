import { test, expect } from '@playwright/test';
import { credentialsFromEnv, loginAs } from './helpers';

test.describe('Gerenciamento do Catálogo no Painel', () => {
  test('navega pelo catálogo, realiza busca e acessa itens arquivados', async ({ page }) => {
    const credentials = credentialsFromEnv('OWNER');
    test.skip(!credentials, 'Credenciais E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD não configuradas.');

    if (!credentials) return;

    await loginAs(page, credentials);
    await page.goto('/dashboard/catalog');

    // Verifica elementos fundamentais da Fase 7 e 4 na página do catálogo
    await expect(page.getByRole('heading', { name: 'Catálogo', level: 1 })).toBeVisible();

    // Presença dos botões de ação principais
    await expect(page.getByRole('link', { name: /Arquivados/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Categoria/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Produto/i })).toBeVisible();

    // Campo de busca com debounce
    const searchInput = page.getByPlaceholder('Buscar produto ou categoria…');
    await expect(searchInput).toBeVisible();

    // Teste de digitação na busca
    await searchInput.fill('ItemInexistenteParaTeste999');
    await expect(page.getByText(/Nenhum resultado para/i)).toBeVisible();

    // Limpar a busca
    await searchInput.fill('');

    // Navegar para a página de itens arquivados
    await page.getByRole('link', { name: /Arquivados/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/catalog\/archived/);
    await expect(page.getByRole('heading', { name: 'Itens Arquivados' })).toBeVisible();

    // Voltar para o catálogo
    await page.getByRole('link', { name: /Voltar ao catálogo/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/catalog/);
  });
});
