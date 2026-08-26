import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const storefrontRoot = path.resolve(process.cwd(), 'src/app/[storeSlug]');

function read(relativePath: string) {
  return fs.readFileSync(path.join(storefrontRoot, relativePath), 'utf8');
}

function listSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory()
      ? listSourceFiles(target)
      : /\.(ts|tsx)$/.test(entry.name)
        ? [target]
        : [];
  });
}

describe('arquitetura de navegação do storefront', () => {
  it('mantém as quatro abas sob uma única moldura persistente', () => {
    const tabsLayout = read('(tabs)/layout.tsx');

    expect(tabsLayout).toContain('StorefrontClientStateProvider');
    expect(tabsLayout).toContain('<StorefrontBottomNav');
    expect(fs.existsSync(path.join(storefrontRoot, '(tabs)/(catalog)/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(storefrontRoot, '(tabs)/cart/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(storefrontRoot, '(tabs)/orders/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(storefrontRoot, '(tabs)/mais/page.tsx'))).toBe(true);

    const navOwners = listSourceFiles(storefrontRoot).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('<StorefrontBottomNav'),
    );
    expect(navOwners).toEqual([path.join(storefrontRoot, '(tabs)/layout.tsx')]);
  });

  it('deixa checkout e rastreio fora da moldura de abas', () => {
    expect(fs.existsSync(path.join(storefrontRoot, 'checkout/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(storefrontRoot, 'order/[token]/page.tsx'))).toBe(true);
    expect(read('checkout/page.tsx')).not.toContain('StorefrontBottomNav');
    expect(read('order/[token]/page.tsx')).not.toContain('StorefrontBottomNav');
  });

  it('limita o skeleton de catálogo à rota de catálogo', () => {
    expect(fs.existsSync(path.join(storefrontRoot, 'loading.tsx'))).toBe(false);
    expect(read('(tabs)/(catalog)/loading.tsx')).toContain('Carregando o cardápio da loja');
    expect(read('(tabs)/cart/loading.tsx')).toContain('StorefrontCartLoading');
    expect(read('(tabs)/orders/loading.tsx')).toContain('StorefrontOrdersLoading');
  });

  it('usa previews de loading específicos por rota e preserva reduced motion', () => {
    expect(read('(tabs)/cart/loading.tsx')).toContain('StorefrontCartLoading');
    expect(read('(tabs)/orders/loading.tsx')).toContain('StorefrontOrdersLoading');
    expect(read('(tabs)/mais/loading.tsx')).toContain('StorefrontMoreLoading');
    expect(read('(tabs)/favorites/loading.tsx')).toContain('StorefrontFavoritesLoading');
    expect(read('(tabs)/account/loading.tsx')).toContain('StorefrontAccountLoading');

    const loadingPrimitives = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/storefront/storefront-tab-loading.tsx'),
      'utf8',
    );
    const theme = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/customization/theme.ts'),
      'utf8',
    );
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    expect(loadingPrimitives).not.toContain('StorefrontTabLoading');
    expect(theme).toContain("'--store-skeleton-base'");
    expect(theme).toContain("'--store-skeleton-highlight'");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.storefront-skeleton-block');
    expect(css).toMatch(/\.storefront-skeleton-block[\s\S]*animation: none !important/);
  });

  it('libera conteúdo estático antes dos dados secundários das abas', () => {
    const cartPage = read('(tabs)/cart/page.tsx');
    const ordersPage = read('(tabs)/orders/page.tsx');
    const morePage = read('(tabs)/mais/page.tsx');

    expect(cartPage).toContain('const comboOffersPromise = getPublicOffers');
    expect(cartPage).not.toContain('const offers = await getPublicOffers');
    expect(ordersPage).toContain('<StorePurchaseHeader');
    expect(ordersPage).toContain(
      '<Suspense fallback={<StorefrontOrdersContentLoading standalone />}>',
    );
    expect(morePage).toContain('offerCount={offerCountPromise}');
    expect(morePage).toContain('hasVerifiedConsumer={verifiedConsumerPromise}');
    expect(morePage).not.toContain('await Promise.all');
  });
});
