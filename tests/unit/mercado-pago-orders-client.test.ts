import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMercadoPagoPixOrder,
  MercadoPagoApiError,
  searchMercadoPagoOrders,
} from '@/lib/mercado-pago/client';

const createResponse = {
  id: 'ORD01JTEST',
  external_reference: 'pl_mp_opaque_reference',
  total_amount: '12.34',
  status: 'action_required',
  status_detail: 'waiting_payment',
  transactions: {
    payments: [
      {
        id: 'PAY01JTEST',
        amount: '12.34',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        date_of_expiration: '2026-08-12T18:00:00.000Z',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
          qr_code: '000201010212...',
          ticket_url: 'https://www.mercadopago.com.br/payments/123/ticket',
        },
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente Mercado Pago Orders', () => {
  it('aceita a resposta documentada de criação sem user_id e currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(createResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createMercadoPagoPixOrder({
      accessToken: 'APP_USR-access',
      idempotencyKey: 'stable-idempotency-key',
      totalAmount: '12.34',
      externalReference: 'pl_mp_opaque_reference',
      payerEmail: 'payer@example.test',
      payerFirstName: 'APRO',
      expiration: 'PT30M',
    });

    expect(result).toMatchObject({
      id: 'ORD01JTEST',
      external_reference: 'pl_mp_opaque_reference',
      total_amount: '12.34',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      payer: { email: 'payer@example.test', first_name: 'APRO' },
    });
  });

  it('consulta por external_reference com janela temporal codificada', async () => {
    const canonicalOrder = { ...createResponse, user_id: 321 };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [canonicalOrder] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchMercadoPagoOrders({
      accessToken: 'APP_USR-access',
      externalReference: 'pl_mp_opaque_reference',
      beginDate: new Date('2026-08-12T17:00:00.000Z'),
      endDate: new Date('2026-08-12T18:00:00.000Z'),
    });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('/v1/orders?');
    expect(requestUrl).toContain('external_reference=pl_mp_opaque_reference');
    expect(requestUrl).toContain('begin_date=2026-08-12T17%3A00%3A00.000Z');
    expect(result.data[0]).toMatchObject({ id: 'ORD01JTEST', user_id: '321' });
  });

  it('mantém Retry-After ausente como null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'rate_limit' }, 429)));

    const error = await createMercadoPagoPixOrder({
      accessToken: 'APP_USR-access',
      idempotencyKey: 'stable-idempotency-key',
      totalAmount: '12.34',
      externalReference: 'pl_mp_opaque_reference',
      payerEmail: 'payer@example.test',
      expiration: 'PT30M',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MercadoPagoApiError);
    expect((error as MercadoPagoApiError).retryAfterSeconds).toBeNull();
  });

  it('interpreta Retry-After numérico sem expor o corpo da resposta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ code: 'rate_limit', message: 'conteúdo privado' }, 429, {
          'Retry-After': '3',
        }),
      ),
    );

    const error = await createMercadoPagoPixOrder({
      accessToken: 'APP_USR-access',
      idempotencyKey: 'stable-idempotency-key',
      totalAmount: '12.34',
      externalReference: 'pl_mp_opaque_reference',
      payerEmail: 'payer@example.test',
      expiration: 'PT30M',
    }).catch((caught: unknown) => caught);

    expect((error as MercadoPagoApiError).retryAfterSeconds).toBe(3);
    expect(String(error)).not.toContain('conteúdo privado');
  });

  it('extrai erro de validação aninhado sem expor a resposta bruta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            errors: [
              {
                code: 'invalid_email_for_sandbox',
                path: 'payer.email',
                message: 'cliente-real@exemplo.com não é permitido',
              },
            ],
          },
          400,
        ),
      ),
    );

    const error = await createMercadoPagoPixOrder({
      accessToken: 'APP_USR-access',
      idempotencyKey: 'stable-idempotency-key',
      totalAmount: '12.34',
      externalReference: 'pl_mp_opaque_reference',
      payerEmail: 'cliente-real@exemplo.com',
      expiration: 'PT30M',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MercadoPagoApiError);
    expect(error).toMatchObject({
      code: 'invalid_email_for_sandbox',
      validationIssues: [{ code: 'invalid_email_for_sandbox', path: 'payer.email' }],
    });
    expect(String(error)).not.toContain('cliente-real@exemplo.com');
  });
});
