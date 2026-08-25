import { describe, expect, it } from 'vitest';

import {
  generateConsumerOtp,
  hashConsumerOtp,
  verifyConsumerOtpHash,
} from '@/server/consumer-verification/otp';

const secret = 'unit-test-consumer-otp-secret-at-least-32-chars';

describe('PedidoLocal-owned consumer OTP', () => {
  it('generates six numeric digits using the runtime cryptographic generator', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateConsumerOtp()).toMatch(/^\d{6}$/u);
    }
  });

  it('stores an HMAC instead of the plaintext code and verifies it safely', async () => {
    const otpHash = await hashConsumerOtp({
      challengeToken: 'opaque-challenge-token',
      code: '482193',
      secret,
    });

    expect(otpHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(otpHash).not.toContain('482193');
    await expect(
      verifyConsumerOtpHash({
        challengeToken: 'opaque-challenge-token',
        code: '482193',
        secret,
        otpHash,
      }),
    ).resolves.toBe(true);
    await expect(
      verifyConsumerOtpHash({
        challengeToken: 'opaque-challenge-token',
        code: '482194',
        secret,
        otpHash,
      }),
    ).resolves.toBe(false);
  });

  it('binds the hash to the opaque challenge token', async () => {
    const otpHash = await hashConsumerOtp({
      challengeToken: 'challenge-a',
      code: '000000',
      secret,
    });
    await expect(
      verifyConsumerOtpHash({
        challengeToken: 'challenge-b',
        code: '000000',
        secret,
        otpHash,
      }),
    ).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(
      verifyConsumerOtpHash({
        challengeToken: 'challenge-a',
        code: '000000',
        secret,
        otpHash: '000000',
      }),
    ).resolves.toBe(false);
  });
});
