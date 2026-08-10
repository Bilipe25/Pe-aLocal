import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderPushSubscription } from '@/components/pwa/order-push-subscription';

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/id',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/id',
    expirationTime: null,
    keys: { p256dh: 'p256dh', auth: 'auth' },
  }),
};
const pushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
};

describe('CTA Web Push do pedido', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pushManager.getSubscription.mockResolvedValue(null);
    pushManager.subscribe.mockResolvedValue(subscription);
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false }))),
    );
  });

  it('solicita permissão somente após o clique e associa a inscrição', async () => {
    render(
      <OrderPushSubscription
        publicToken="00000000-0000-4000-8000-000000000001"
        storeSlug="burger-do-ze"
        publicVapidKey={`B${'A'.repeat(86)}`}
        status="PREPARING"
      />,
    );
    const button = await screen.findByRole('button', { name: 'Ativar' });
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(window.Notification.requestPermission).toHaveBeenCalledOnce());
    await waitFor(() => expect(pushManager.subscribe).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desativar' })).toBeVisible());
  });

  it('não mostra CTA para pedido terminal', () => {
    const { container } = render(
      <OrderPushSubscription
        publicToken="00000000-0000-4000-8000-000000000001"
        storeSlug="burger-do-ze"
        publicVapidKey={`B${'A'.repeat(86)}`}
        status="DELIVERED"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
