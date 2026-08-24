import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignature: vi.fn(),
  enqueueWebhook: vi.fn(),
  workerFetch: vi.fn(),
  config: {
    clientId: '32620436153512',
    testApplicationId: '1828304174612090' as string | undefined,
    webhookSecret: 'webhook-secret',
    oauthEnvironment: 'sandbox' as 'sandbox' | 'production',
  },
}));
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { ORDER_EVENTS_WORKER: { fetch: mocks.workerFetch } },
  })),
}));

vi.mock('@/lib/mercado-pago/config', () => ({
  getMercadoPagoConfig: () => mocks.config,
  getMercadoPagoWebhookApplicationId: (config: typeof mocks.config) => {
    if (config.oauthEnvironment === 'production') return config.clientId;
    if (!config.testApplicationId) throw new Error('missing test application id');
    return config.testApplicationId;
  },
}));
vi.mock('@/lib/mercado-pago/signature', () => ({
  verifyMercadoPagoSignature: mocks.verifySignature,
}));
vi.mock('@/server/services/mercado-pago-webhook.service', () => ({
  enqueueMercadoPagoWebhook: mocks.enqueueWebhook,
}));

import { POST } from '@/app/api/webhooks/mercado-pago/route';

const officialPayload = {
  action: 'order.action_required',
  api_version: 'v1',
  application_id: '1828304174612090',
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

const expandedSandboxPayload = {
  action: 'order.processed',
  api_version: 'v1',
  application_id: '1828304174612090',
  data: {
    currency_id: 'BRL',
    external_reference: 'pl_110ae484-2ede-46e6-9fe5-a3a066d84ba7',
    id: 'ORDTST01M0D80PSR72W02JZFG2DS55EQ',
    status: 'processed',
    status_detail: 'accredited',
    total_amount: '50.00',
    total_paid_amount: '50.00',
    transactions: {
      payments: [
        {
          amount: '50.00',
          id: 'PAY01M0D80PT7ZJV3XRPRFV67SSXX',
          paid_amount: '50.00',
          payment_method: { id: 'pix', type: 'bank_transfer' },
          status: 'processed',
          status_detail: 'accredited',
        },
      ],
    },
    type: 'online',
    version: 2,
  },
  date_created: '2026-08-19T14:51:04.521013205Z',
  live_mode: false,
  type: 'order',
  user_id: '3610124436',
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
    mocks.config.clientId = '32620436153512';
    mocks.config.testApplicationId = '1828304174612090';
    mocks.config.oauthEnvironment = 'sandbox';
    mocks.verifySignature.mockResolvedValue({ valid: true });
    mocks.enqueueWebhook.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      processedAt: null,
    });
    mocks.workerFetch.mockResolvedValue(new Response(null, { status: 202 }));
  });

  it('aceita e enfileira o payload oficial com application_id e tópico order', async () => {
    const response = await POST(request(officialPayload));

    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '123456',
        type: 'order',
        user_id: '2025701502',
        application_id: '1828304174612090',
        data: { id: officialPayload.data.id },
      }),
    );
    expect(mocks.workerFetch).toHaveBeenCalledWith(
      'https://order-events.internal/internal/mercado-pago/webhook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('normaliza e enfileira a notificação sandbox expandida sem confiar no status recebido', async () => {
    const response = await POST(request(expandedSandboxPayload, expandedSandboxPayload.data.id));

    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhook).toHaveBeenCalledWith({
      id: expect.stringMatching(/^expanded_[a-f0-9]{64}$/u),
      action: 'order.processed',
      api_version: 'v1',
      application_id: '1828304174612090',
      data: { id: expandedSandboxPayload.data.id },
      date_created: expandedSandboxPayload.date_created,
      live_mode: false,
      type: 'order',
      user_id: '3610124436',
    });
    expect(mocks.enqueueWebhook.mock.calls[0]?.[0]).not.toHaveProperty('status');
  });

  it('rejeita uma notificacao real assinada para outra aplicacao', async () => {
    const response = await POST(request({ ...officialPayload, application_id: 'outra-aplicacao' }));

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('rejeita uma notificação real de produção recebida no sandbox', async () => {
    const response = await POST(request({ ...officialPayload, live_mode: true }));

    expect(response.status).toBe(400);
    expect(mocks.enqueueWebhook).not.toHaveBeenCalled();
  });

  it('usa o Client ID principal para notificações reais em produção', async () => {
    mocks.config.oauthEnvironment = 'production';
    const payload = { ...officialPayload, application_id: '32620436153512', live_mode: true };

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    expect(mocks.enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ application_id: '32620436153512' }),
    );
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

  it('falha fechado quando o N.º da aplicação de teste não está configurado', async () => {
    mocks.config.testApplicationId = undefined;

    const response = await POST(request(officialPayload));

    expect(response.status).toBe(503);
    expect(mocks.verifySignature).not.toHaveBeenCalled();
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
