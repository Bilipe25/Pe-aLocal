import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

import { createDatabaseClient } from '../src/server/database/factory';
import {
  countRetainedOrderOutboxEvents,
  ORDER_OUTBOX_DEFAULT_RETENTION_BATCH_SIZE,
  ORDER_OUTBOX_DEFAULT_RETENTION_DAYS,
  purgeProcessedOrderOutboxEvents,
} from '../src/server/services/order-outbox-retention';

const DEFAULT_MAX_BATCHES = 20;

function parseInteger(value: string | undefined, minimum: number, maximum: number, name: string) {
  if (!value || !/^\d+$/.test(value)) throw new Error(`invalid_${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`invalid_${name}`);
  }
  return parsed;
}

export function parseOrderOutboxRetentionOptions(args: string[]) {
  const options = {
    apply: false,
    retentionDays: ORDER_OUTBOX_DEFAULT_RETENTION_DAYS,
    batchSize: ORDER_OUTBOX_DEFAULT_RETENTION_BATCH_SIZE,
    maxBatches: DEFAULT_MAX_BATCHES,
  };

  for (const argument of args) {
    if (argument === '--') continue;
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }

    const [flag, value] = argument.split('=', 2);
    if (flag === '--retention-days') {
      options.retentionDays = parseInteger(value, 7, 3650, 'retention_days');
    } else if (flag === '--batch-size') {
      options.batchSize = parseInteger(value, 10, 5000, 'batch_size');
    } else if (flag === '--max-batches') {
      options.maxBatches = parseInteger(value, 1, 1000, 'max_batches');
    } else {
      throw new Error('unknown_argument');
    }
  }

  return options;
}

export async function runOrderOutboxRetention({
  db,
  options,
}: {
  db: ReturnType<typeof createDatabaseClient>;
  options: ReturnType<typeof parseOrderOutboxRetentionOptions>;
}) {
  if (!options.apply) {
    const preview = await countRetainedOrderOutboxEvents(db, options);
    return {
      status: 'dry_run' as const,
      eligible: preview.eligible,
      retentionDays: preview.retentionDays,
      cutoff: preview.cutoff.toISOString(),
    };
  }

  let deleted = 0;
  let batches = 0;
  let batchLimitReached = false;
  while (batches < options.maxBatches) {
    const result = await purgeProcessedOrderOutboxEvents(db, options);
    deleted += result.deleted;
    batches += 1;
    if (result.deleted < options.batchSize) break;
    batchLimitReached = batches === options.maxBatches;
  }

  return {
    status: 'applied' as const,
    deleted,
    batches,
    batchLimitReached,
    retentionDays: options.retentionDays,
    batchSize: options.batchSize,
  };
}

async function main() {
  loadEnv({ path: path.join(process.cwd(), '.env.local'), quiet: true });

  let options: ReturnType<typeof parseOrderOutboxRetentionOptions>;
  try {
    options = parseOrderOutboxRetentionOptions(process.argv.slice(2));
  } catch (error) {
    console.error('[ORDER_OUTBOX_RETENTION_FAILED]', {
      kind: error instanceof Error ? error.message : 'invalid_options',
    });
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) {
    console.error('[ORDER_OUTBOX_RETENTION_FAILED]', { kind: 'missing_direct_url' });
    process.exitCode = 1;
    return;
  }

  const db = createDatabaseClient(connectionString);
  try {
    const result = await runOrderOutboxRetention({ db, options });
    console.info('[ORDER_OUTBOX_RETENTION]', result);
  } catch (error) {
    console.error('[ORDER_OUTBOX_RETENTION_FAILED]', {
      kind: 'database_operation_failed',
      databaseCode:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined,
    });
    process.exitCode = 1;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isEntrypoint) await main();
