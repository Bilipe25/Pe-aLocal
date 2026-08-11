import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StorePushSubscription,
  StorePushSubscriptionProvider,
} from '@/components/dashboard/store-push-subscription';

describe('alertas globais do estabelecimento', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('compartilha uma única sincronização entre os controles desktop e mobile', async () => {
    const getSubscription = vi.fn().mockResolvedValue({
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-id',
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn(),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ enabled: true, badgeCount: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StorePushSubscriptionProvider publicVapidKey="vapid-public-key">
        <StorePushSubscription storeName="Burger do Zé" />
        <StorePushSubscription storeName="Burger do Zé" surface="mobile-menu" />
      </StorePushSubscriptionProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(getSubscription).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Ativos neste dispositivo')).toHaveLength(2);
  });
});
