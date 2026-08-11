import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('não deixa uma verificação antiga transformar ativação concluída em erro', async () => {
    let finishInitialCheck!: (response: Response) => void;
    const initialCheck = new Promise<Response>((resolve) => {
      finishInitialCheck = resolve;
    });
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-id',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-id',
        expirationTime: null,
        keys: { p256dh: 'p256dh', auth: 'auth' },
      }),
    };
    const getSubscription = vi.fn().mockResolvedValue(subscription);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
    });
    vi.stubGlobal('PushManager', class PushManager {});
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ enabled: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return initialCheck;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <StorePushSubscriptionProvider publicVapidKey="vapid-public-key">
        <StorePushSubscription storeName="Burger do Zé" />
      </StorePushSubscriptionProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: /alertas de pedidos/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar para esta loja' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true),
    );
    expect(await screen.findByText('Ativos neste dispositivo')).toBeVisible();
    expect(screen.getByText('Alertas ativados com sucesso neste dispositivo.')).toBeVisible();

    finishInitialCheck(
      new Response(JSON.stringify({ message: 'Falha temporária na verificação.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Ativos neste dispositivo')).toBeVisible();
    expect(screen.queryByText('Falha temporária na verificação.')).not.toBeInTheDocument();
  });
});
