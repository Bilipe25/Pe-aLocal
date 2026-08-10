import { describe, expect, it, vi } from 'vitest';

import { createPusherHttpClient } from '@/lib/pusher/http-client';

describe('Pusher HTTP client para Workers', () => {
  it('publica com fetch nativo e assinatura sem depender de node-fetch', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const client = createPusherHttpClient({
      appId: '123',
      key: 'public-key',
      secret: 'private-secret',
      cluster: 'mt1',
      fetch: request,
      now: () => 1_700_000_000_000,
    });

    await client.trigger(['private-store-a'], 'order-updated', { status: 'READY' });

    expect(request).toHaveBeenCalledOnce();
    const [rawUrl, init] = request.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin).toBe('https://api-mt1.pusher.com');
    expect(url.pathname).toBe('/apps/123/events');
    expect(url.searchParams.get('auth_key')).toBe('public-key');
    expect(url.searchParams.get('auth_timestamp')).toBe('1700000000');
    expect(url.searchParams.get('auth_signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'order-updated',
      channels: ['private-store-a'],
      data: JSON.stringify({ status: 'READY' }),
    });
  });

  it('não inclui credenciais ou URL assinada no erro HTTP', async () => {
    const client = createPusherHttpClient({
      appId: '123',
      key: 'public-key',
      secret: 'private-secret',
      cluster: 'mt1',
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    });

    await expect(client.trigger('private-store-a', 'order-updated', {})).rejects.toThrow(
      'Pusher request failed with status 503.',
    );
  });
});
