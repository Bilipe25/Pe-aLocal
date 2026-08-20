import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiningRoomWorkspace } from '@/features/dining-room/dining-room-workspace';
import type { DiningRoomSnapshotDto } from '@/types/dining-room';

vi.mock('@/hooks/use-order-realtime', () => ({ useOrderRealtime: () => 'unavailable' }));

const snapshot: DiningRoomSnapshotDto = {
  enabledForNewOrders: true,
  storeId: 'store-a',
  storeName: 'Hamburgueria do João',
  generatedAt: '2026-08-20T18:00:00.000Z',
  totals: { tables: 3, open: 2, assistance: 1, bill: 0 },
  tables: [
    {
      tableId: 'table-02',
      label: 'Mesa 02',
      sortOrder: 1,
      isActive: true,
      state: 'OPEN',
      sessionId: 'session-02',
      sessionVersion: 2,
      openedAt: '2026-08-20T17:30:00.000Z',
      lastOrderAt: '2026-08-20T17:50:00.000Z',
      orderCount: 3,
      totalConsideredCents: 9_190,
      pendingCents: 4_990,
      openRequest: null,
    },
    {
      tableId: 'table-04',
      label: 'Mesa 04',
      sortOrder: 3,
      isActive: true,
      state: 'ASSISTANCE',
      sessionId: 'session-04',
      sessionVersion: 4,
      openedAt: '2026-08-20T17:55:00.000Z',
      lastOrderAt: '2026-08-20T17:56:00.000Z',
      orderCount: 1,
      totalConsideredCents: 2_000,
      pendingCents: 2_000,
      openRequest: {
        id: 'request-04',
        type: 'ASSISTANCE',
        version: 0,
        createdAt: '2026-08-20T17:59:00.000Z',
      },
    },
    {
      tableId: 'table-08',
      label: 'Mesa 08',
      sortOrder: 7,
      isActive: true,
      state: 'FREE',
      sessionId: null,
      sessionVersion: null,
      openedAt: null,
      lastOrderAt: null,
      orderCount: 0,
      totalConsideredCents: 0,
      pendingCents: 0,
      openRequest: null,
    },
  ],
};

describe('visão operacional do salão', () => {
  it('prioriza atenção, mantém mesas abertas e reduz mesas livres a uma lista', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DiningRoomWorkspace
          storeId="store-a"
          authorizationScope="user:ATTENDANT"
          initialSnapshot={snapshot}
        />
      </QueryClientProvider>,
    );
    const attentionHeading = screen.getByRole('heading', { name: 'Precisa de você agora' });
    const openHeading = screen.getByRole('heading', { name: 'Em atendimento' });
    expect(
      attentionHeading.compareDocumentPosition(openHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Atender chamado de Mesa 04/ })).toBeEnabled();
    expect(screen.getByText('Mesa 08')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abrir mesa 08/i })).not.toBeInTheDocument();
  });
});
