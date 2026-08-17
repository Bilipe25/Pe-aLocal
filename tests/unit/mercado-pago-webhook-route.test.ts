import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateSignature: vi.fn(),
  enqueueWebhook: vi.fn(),
}));

vi.mock('@/lib/mercado-pago/config', () => ({
  getMercadoPagoConfig: () => ({ webhookSecret: 'webhook-secret' }),
}));
vi.mock('@/lib/mercado-pago/signature', () => ({
  validateMercadoPagoSignature: mocks.validateSignature,
}));
vi.mock('@/server/services/mercado-pago-webhook.service', () => ({
  enqueueMercadoPagoWebhook: mocks.enqueueWebhook,
}));

import { POST } from '@/app/api/webhooks/mercado-pago/route';

const officialPayload = {
  action: 'order.action_required',
  api_version: 'v1',
  application_id: '76506430185983',
  date_created: '2026-08-17T22:37:39.000Z',
  id: '123456',
  live_mode: false,
  type: 'order',
  user_id: 2025701502,
  data: { id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' },
};

function request(payload: unknown) {
  return new Request(
    `https://pedidolocal.test/api/webhooks/mercado-pago?data.id=${officialPayload.data.id}&type=order`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request-1',
        'x-signature': 'ts=123,v1=signature',
      },
      body: JSON.stringify(payload),
    },
  );
}

describe('webhook Mercado Pago Orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateSignature.mockResolvedValue(true);
    mocks.enqueueWebhook.mockResolvedValue({ id: 'event-1', processedAt: null });
  });

  it('aceita e enfileira o payload oficial com application_id e tópico order', async () => {
    const response = await POST(request(officialPayload));

    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '123456',
        type: 'order',
        user_id: '2025701502',
        application_id: '76506430185983',
        data: { id: officialPayload.data.id },
      }),
    );
  });

  it('continua rejeitando campos desconhecidos mesmo com assinatura válida', async () => {
    const response = await POST(request({ ...officialPayload, access_token: 'não permitido' }));

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });
});
