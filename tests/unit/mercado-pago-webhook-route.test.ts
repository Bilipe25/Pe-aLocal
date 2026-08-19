import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  validateSignature: vi.fn(),
  enqueueWebhook: vi.fn(),
}));

vi.mock('@/lib/mercado-pago/config', () => ({
  getMercadoPagoConfig: () => ({
    clientId: '32620436153512',
    webhookSecret: 'webhook-secret',
  }),
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
  application_id: '32620436153512',
  date_created: '2026-08-17T22:37:39.000Z',
  id: '123456',
  live_mode: false,
  type: 'order',
  user_id: 2025701502,
  data: { id: 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3' },
};

const urlValidationProbePayload = {
  action: 'order.processed',
  api_version: 'v1',
  application_id: '32620436153512',
  data: {
    external_reference: 'ext_ref_1234',
    id: '123456',
    status: 'processed',
    status_detail: 'accredited',
    total_paid_amount: 100000,
    transactions: {
      payments: [
        {
          amount: 100000,
          id: 'PAY01K7S9596QBWZRTY02NF',
          paid_amount: 100000,
          payment_method: { id: 'visa', installments: 1, type: 'credit_card' },
          reference: { id: 1234567891 },
          status: 'processed',
          status_detail: 'accredited',
        },
      ],
    },
    type: 'point',
    version: 3,
  },
  date_created: '2021-11-01T02:02:02-04:00',
  live_mode: true,
  type: 'order',
  user_id: 184030921,
};

function request(payload: unknown, dataId = officialPayload.data.id) {
  return new Request(
    `https://pedidolocal.test/api/webhooks/mercado-pago?data.id=${dataId}&type=order`,
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
        application_id: '32620436153512',
        data: { id: officialPayload.data.id },
      }),
    );
  });

  it('rejeita uma notificacao real assinada para outra aplicacao', async () => {
    const response = await POST(request({ ...officialPayload, application_id: 'outra-aplicacao' }));

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('continua rejeitando campos desconhecidos mesmo com assinatura válida', async () => {
    const response = await POST(request({ ...officialPayload, access_token: 'não permitido' }));

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('aceita a sondagem assinada do painel sem enfileirar a order fictícia', async () => {
    const response = await POST(request(urlValidationProbePayload, '123456'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('rejeita a sondagem de outra aplicação', async () => {
    const response = await POST(
      request({ ...urlValidationProbePayload, application_id: 'outra-aplicacao' }, '123456'),
    );

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });
});
