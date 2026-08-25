import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('database_url_missing');

const client = new Client({ connectionString: databaseUrl });
const lockName = 'pedidolocal:consumer-identity-cleanup';

const countsSql = `
  SELECT
    (SELECT COUNT(*)::integer FROM consumer_verification_challenges
      WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '7 days') AS challenges,
    (SELECT COUNT(*)::integer FROM consumer_sessions
      WHERE ("expiresAt" < CURRENT_TIMESTAMP - INTERVAL '30 days')
         OR ("revokedAt" < CURRENT_TIMESTAMP - INTERVAL '30 days')) AS sessions,
    (SELECT COUNT(*)::integer FROM consumer_email_change_requests
      WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND status IN ('COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')) AS email_changes
`;

const deleteSql = `
  WITH expired_challenges AS (
    SELECT id FROM consumer_verification_challenges
    WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '7 days'
    ORDER BY "expiresAt", id LIMIT 1000 FOR UPDATE SKIP LOCKED
  ), deleted_challenges AS (
    DELETE FROM consumer_verification_challenges target
    USING expired_challenges candidate WHERE target.id = candidate.id RETURNING 1
  ), expired_sessions AS (
    SELECT id FROM consumer_sessions
    WHERE ("expiresAt" < CURRENT_TIMESTAMP - INTERVAL '30 days')
       OR ("revokedAt" < CURRENT_TIMESTAMP - INTERVAL '30 days')
    ORDER BY COALESCE("revokedAt", "expiresAt"), id LIMIT 1000 FOR UPDATE SKIP LOCKED
  ), deleted_sessions AS (
    DELETE FROM consumer_sessions target
    USING expired_sessions candidate WHERE target.id = candidate.id RETURNING 1
  ), expired_changes AS (
    SELECT id FROM consumer_email_change_requests
    WHERE "expiresAt" < CURRENT_TIMESTAMP - INTERVAL '30 days'
      AND status IN ('COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED')
    ORDER BY "expiresAt", id LIMIT 1000 FOR UPDATE SKIP LOCKED
  ), deleted_changes AS (
    DELETE FROM consumer_email_change_requests target
    USING expired_changes candidate WHERE target.id = candidate.id RETURNING 1
  )
  SELECT
    (SELECT COUNT(*)::integer FROM deleted_challenges) AS challenges,
    (SELECT COUNT(*)::integer FROM deleted_sessions) AS sessions,
    (SELECT COUNT(*)::integer FROM deleted_changes) AS email_changes
`;

try {
  await client.connect();
  const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [
    lockName,
  ]);
  if (!lock.rows[0]?.acquired) {
    console.log(JSON.stringify({ event: 'consumer_identity_cleanup_skipped', reason: 'running' }));
    process.exitCode = 2;
  } else if (!apply) {
    const result = await client.query(countsSql);
    console.log(JSON.stringify({ event: 'consumer_identity_cleanup_dry_run', ...result.rows[0] }));
  } else {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const result = await client.query(deleteSql);
    await client.query('COMMIT');
    console.log(JSON.stringify({ event: 'consumer_identity_cleanup_applied', ...result.rows[0] }));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(
    JSON.stringify({
      event: 'consumer_identity_cleanup_failed',
      error: error instanceof Error ? error.name : 'unknown',
    }),
  );
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => undefined);
  await client.end().catch(() => undefined);
}
