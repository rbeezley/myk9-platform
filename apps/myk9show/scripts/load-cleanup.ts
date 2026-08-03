import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  hasQuietRollbackWindow,
  SCORING_WORKER_QUERY_FRAGMENT,
  type RollbackSample,
} from '../src/test/load/loadTeardown';

const execFileAsync = promisify(execFile);
const DRAIN_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 5_000;

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('Missing SUPABASE_DB_URL for load cleanup.');
const ownedSinceUs = Number(process.env.LOAD_TEST_OWNED_SINCE_US);
if (!Number.isSafeInteger(ownedSinceUs) || ownedSinceUs <= 0) {
  throw new Error('Missing or invalid LOAD_TEST_OWNED_SINCE_US for load cleanup.');
}

const psqlEnvironment = {
  ...process.env,
  PGPASSWORD: process.env.SUPABASE_DB_PASSWORD,
};

async function runPsql(sql: string): Promise<string> {
  const result = await execFileAsync(
    'psql',
    [databaseUrl!, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql],
    { env: psqlEnvironment, maxBuffer: 1_000_000 }
  );
  return result.stdout.trim();
}

async function cancelScoringWorkers(): Promise<void> {
  await runPsql(`
    SELECT pg_cancel_backend(pid)
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
      AND datname = current_database()
      AND state <> 'idle'
      AND query ILIKE '%${SCORING_WORKER_QUERY_FRAGMENT}%'
      AND query_start >= to_timestamp(${ownedSinceUs} / 1000000.0);
  `);
}

async function readRollbackSample(): Promise<RollbackSample> {
  const output = await runPsql(`
    SELECT
      count(*) FILTER (
        WHERE pid <> pg_backend_pid()
          AND datname = current_database()
          AND state <> 'idle'
          AND query ILIKE '%${SCORING_WORKER_QUERY_FRAGMENT}%'
      ),
      xact_rollback
    FROM pg_stat_activity
    CROSS JOIN pg_stat_database
    WHERE pg_stat_database.datname = current_database()
    GROUP BY xact_rollback;
  `);
  const [scoringWorkers, rollbackCount] = output.split('|').map(Number);
  if (!Number.isSafeInteger(scoringWorkers) || !Number.isSafeInteger(rollbackCount)) {
    throw new Error('Load cleanup received an invalid rollback sample.');
  }
  return { scoringWorkers, rollbackCount };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function drainScoringWorkers(): Promise<void> {
  const samples: RollbackSample[] = [];
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  await cancelScoringWorkers();

  while (Date.now() < deadline) {
    samples.push(await readRollbackSample());
    if (hasQuietRollbackWindow(samples)) {
      console.log('Scoring workers are zero and rollback quiet window passed.');
      return;
    }
    await cancelScoringWorkers();
    await delay(POLL_INTERVAL_MS);
  }

  throw new Error(
    'Cleanup refused to reseed: scoring workers or rollback activity did not become quiet.'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  drainScoringWorkers().catch(error => {
    console.error(error instanceof Error ? error.message : 'Load cleanup failed.');
    process.exitCode = 1;
  });
}
