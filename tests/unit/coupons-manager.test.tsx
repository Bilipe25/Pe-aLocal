import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CouponsManager } from '@/features/coupons/components/coupons-manager';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/features/coupons/actions', () => ({
  deleteCouponAction: vi.fn(),
}));

const coupon = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'BEMVINDO10',
  type: 'PERCENTAGE' as const,
  value: 10,
  minOrderValue: 2_000,
  maxDiscount: 1_000,
  maxUsages: 100,
  usageCount: 0,
  isActive: true,
  startsAt: null,
  expiresAt: null,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
};

describe('CouponsManager', () => {
  it('mantém o MANAGER em uma experiência somente leitura', () => {
    render(
      <CouponsManager
        coupons={[coupon]}
        canEdit={false}
        page={1}
        totalPages={1}
        total={1}
        referenceTime={Date.parse('2026-07-27T13:00:00.000Z')}
      />,
    );

    expect(screen.getByText(/somente o proprietário/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /novo cupom/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText('BEMVINDO10')).toBeInTheDocument();
  });

  it('oferece criação, edição e exclusão ao OWNER', () => {
    render(
      <CouponsManager
        coupons={[coupon]}
        canEdit
        page={1}
        totalPages={1}
        total={1}
        referenceTime={Date.parse('2026-07-27T13:00:00.000Z')}
      />,
    );

    expect(screen.getByRole('button', { name: /novo cupom/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excluir/i })).toBeInTheDocument();
  });
});
