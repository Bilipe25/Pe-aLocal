import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminNavigation } from '@/components/admin/admin-navigation';

let mockPathname = '/admin';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('AdminNavigation', () => {
  beforeEach(() => {
    mockPathname = '/admin';
  });

  it('identifica a visão geral como página atual', () => {
    render(<AdminNavigation />);

    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Estabelecimentos' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('mantém Estabelecimentos ativo nas subpáginas administrativas', () => {
    mockPathname = '/admin/tenants/tenant-1/stores/store-1/customization';
    render(<AdminNavigation />);

    expect(screen.getByRole('link', { name: 'Estabelecimentos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Visão geral' })).not.toHaveAttribute('aria-current');
  });
});
