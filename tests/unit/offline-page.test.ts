import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('página offline estática', () => {
  it('funciona sem runtime Next, oferece retry GET e não expõe dados do pedido', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public', 'offline.html'), 'utf8');

    expect(html).toContain('<h1 id="offline-title">Você está offline</h1>');
    expect(html).toContain('<form method="get" action="">');
    expect(html).toContain('min-height: 44px');
    expect(html).not.toMatch(/carrinho|pedido\s*#|endere[cç]o|telefone|salvo/i);
    expect(html).not.toMatch(/<script|_next\//i);
  });
});
