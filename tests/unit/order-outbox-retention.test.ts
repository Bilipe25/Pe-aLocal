import { describe, expect, it, vi } from 'vitest';

import {
  countRetainedOrderOutboxEvents,
  purgeProcessedOrderOutboxEvents,
  resolveOrderOutboxRetentionOptions,
} from '@/server/services/order-outbox-retention';
import {
  parseOrderOutboxRetentionOptions,
  runOrderOutboxRetention,
} from '../../tools/order-outbox-retention';

describe('retenção do outbox de pedidos', () => {
  it('mantém uma janela mínima segura e calcula o corte de forma determinística', () => {
    const result = resolveOrderOutboxRetentionOptions({
      retentionDays: 30,
      batchSize: 500,
      now: new Date('2026-07-31T12:00:00.000Z'),
    });

    expect(result.cutoff.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(() => resolveOrderOutboxRetentionOptions({ retentionDays: 1 })).toThrow(
      'Invalid retentionDays.',
    );
  });

  it('remove somente eventos processados antigos em lote com SKIP LOCKED', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ deleted: 17 }]);
    const result = await purgeProcessedOrderOutboxEvents({ $queryRaw: queryRaw } as never, {
      retentionDays: 30,
      batchSize: 100,
      now: new Date('2026-07-31T12:00:00.000Z'),
    });
    const sql = queryRaw.mock.calls[0]?.[0] as { strings: string[] };
    const statement = sql.strings.join(' ');

    expect(result.deleted).toBe(17);
    expect(statement).toContain("status = 'PROCESSED'");
    expect(statement).toContain('"processedAt" IS NOT NULL');
    expect(statement).toContain('FOR UPDATE SKIP LOCKED');
    expect(statement).toContain("event.status = 'PROCESSED'");
  });

  it('faz dry-run por padrão e exige --apply para excluir', async () => {
    expect(parseOrderOutboxRetentionOptions([])).toMatchObject({
      apply: false,
      retentionDays: 30,
      batchSize: 500,
    });

    const queryRaw = vi.fn().mockResolvedValue([{ eligible: 42 }]);
    const result = await runOrderOutboxRetention({
      db: { $queryRaw: queryRaw } as never,
      options: parseOrderOutboxRetentionOptions([]),
    });

    expect(result).toMatchObject({ status: 'dry_run', eligible: 42, retentionDays: 30 });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('interrompe a aplicação quando um lote vem incompleto', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ deleted: 10 }])
      .mockResolvedValueOnce([{ deleted: 3 }]);
    const result = await runOrderOutboxRetention({
      db: { $queryRaw: queryRaw } as never,
      options: parseOrderOutboxRetentionOptions([
        '--apply',
        '--retention-days=60',
        '--batch-size=10',
        '--max-batches=5',
      ]),
    });

    expect(result).toMatchObject({
      status: 'applied',
      deleted: 13,
      batches: 2,
      batchLimitReached: false,
    });
  });

  it('conta apenas linhas elegíveis sem executar DELETE', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ eligible: 9 }]);
    await countRetainedOrderOutboxEvents({ $queryRaw: queryRaw } as never);
    const sql = queryRaw.mock.calls[0]?.[0] as { strings: string[] };
    expect(sql.strings.join(' ')).not.toContain('DELETE FROM');
  });
});
