import { describe, expect, it } from 'vitest';

import {
  decryptPosDraftPayload,
  encryptPosDraftPayload,
  posDraftAad,
} from '@/lib/pos-draft/crypto';

const key = Buffer.alloc(32, 7).toString('base64');

describe('criptografia de PosDraft', () => {
  it('recupera o payload somente com a mesma chave e o mesmo escopo', async () => {
    const aad = posDraftAad({ tenantId: 'tenant-a', storeId: 'store-a', draftId: 'draft-a' });
    const payload = JSON.stringify({ customerPhone: '5511999999999', items: ['product-a'] });
    const encrypted = await encryptPosDraftPayload(payload, key, aad);

    expect(encrypted.ciphertext).not.toContain('5511999999999');
    await expect(decryptPosDraftPayload(encrypted, key, aad)).resolves.toBe(payload);
    await expect(
      decryptPosDraftPayload(
        encrypted,
        key,
        posDraftAad({ tenantId: 'tenant-b', storeId: 'store-a', draftId: 'draft-a' }),
      ),
    ).rejects.toThrow();
  });

  it('rejeita chave que não tenha 32 bytes em base64', async () => {
    await expect(encryptPosDraftPayload('{}', 'aW52YWxpZA==', 'scope')).rejects.toThrow('32 bytes');
  });
});
