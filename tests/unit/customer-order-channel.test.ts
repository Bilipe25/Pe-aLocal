import { describe, expect, it } from 'vitest';

import { privateCustomerOrderChannel } from '@/lib/pusher/customer-channel';

describe('canal privado do acompanhamento', () => {
  it('é determinístico e não expõe o token público no nome', async () => {
    const token = '4da03571-bffd-45ef-8c44-20686c487838';
    const first = await privateCustomerOrderChannel(token);
    const second = await privateCustomerOrderChannel(token);

    expect(first).toBe(second);
    expect(first).toMatch(/^private-order-[a-f0-9]{64}$/);
    expect(first).not.toContain(token);
  });
});
