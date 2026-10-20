import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  comparePostmasterStart,
  POSTMASTER_START_SQL,
} from '../src/test/load/loadPostmasterRestart';

/**
 * `record`  prints `postmaster-start=<iso>` to GITHUB_OUTPUT (prepare job, before load).
 * `compare` re-reads it and fails when it differs from LOAD_TEST_POSTMASTER_BEFORE.
 * Both use the admin transaction-mode port, which stays reachable under load.
 */
const execFileAsync = promisify(execFile);
const mode = process.argv[2];
const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('Missing SUPABASE_DB_URL for the Postgres restart check.');

async function readStart(): Promise<string> {
  const result = await execFileAsync(
    'psql',
    [databaseUrl!, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', POSTMASTER_START_SQL],
    { env: { ...process.env, PGPASSWORD: process.env.SUPABASE_DB_PASSWORD } }
  );
  return result.stdout.trim();
}

function appendSummary(line: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

try {
  if (mode === 'record') {
    const start = await readStart();
    if (comparePostmasterStart(start, start).status !== 'unchanged') {
      throw new Error(`Database returned an unreadable postmaster start time: ${start}`);
    }
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is not set.');
    appendFileSync(process.env.GITHUB_OUTPUT, `postmaster-start=${start}\n`);
    console.log(`Postgres started ${start}.`);
  } else if (mode === 'compare') {
    const after = await readStart().catch(() => undefined);
    const comparison = comparePostmasterStart(process.env.LOAD_TEST_POSTMASTER_BEFORE, after);
    console.log(comparison.message);
    if (comparison.status !== 'unchanged') {
      console.error(`::error::${comparison.message}`);
      appendSummary(`## Postgres restart check: FAILED\n\n${comparison.message}\n`);
      process.exitCode = 1;
    } else {
      appendSummary(`Postgres restart check: ${comparison.message}`);
    }
  } else {
    throw new Error('Usage: load-postmaster-check.ts record|compare');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Postgres restart check failed.');
  process.exitCode = 1;
}
