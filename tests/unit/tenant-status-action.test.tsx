import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantStatusAction } from '@/components/admin/tenant-status-action';
import { changeTenantStatusAction } from '@/features/admin/actions';

const { mockRefresh, mockSuccess } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({
  toast: { success: mockSuccess, error: vi.fn() },
}));

vi.mock('@/features/admin/actions', () => ({
  changeTenantStatusAction: vi.fn(),
}));

describe('TenantStatusAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(changeTenantStatusAction).mockResolvedValue();
  });

  it('exige confirmação antes de suspender e informa a consequência', async () => {
    render(
      <TenantStatusAction tenantId="tenant-1" tenantName="Restaurante Local" status="ACTIVE" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(screen.getByRole('heading', { name: 'Suspender Restaurante Local?' })).toBeVisible();
    expect(screen.getByText(/perderá o acesso operacional/i)).toBeVisible();
    expect(changeTenantStatusAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Suspender estabelecimento' }));

    await waitFor(() =>
      expect(changeTenantStatusAction).toHaveBeenCalledWith('tenant-1', 'SUSPENDED'),
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockSuccess).toHaveBeenCalledOnce();
  });
});
