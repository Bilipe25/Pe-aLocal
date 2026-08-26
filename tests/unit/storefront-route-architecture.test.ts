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
    expect(read('(tabs)/cart/loading.tsx')).toContain('Preparando sua sacola');
    expect(read('(tabs)/orders/loading.tsx')).toContain('Atualizando seus pedidos');
  });
});
