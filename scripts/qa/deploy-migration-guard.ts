/**
 * Deploy myK9Show's own schema guard (MYK9-1527). Runs inside the workflow's
 * preflight job, after it picks the commit, and refuses when that exact commit
 * carries a migration absent from schema_migrations. Checking here rather than
 * only in the local tripwire closes the gap between "checked" and "deployed":
 * whatever commit the workflow picks, by any caller, is the one compared
 * (Codex review, PR #3438).
 *
 *   COMMIT_SHA=<40-char sha> PGPASSWORD=... node --experimental-strip-types scripts/qa/deploy-migration-guard.ts
 *
 * Exit 0 = every migration on the commit is applied; 1 = refuse, names them;
 * 2 = could not decide (also refuse).
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { MYK9_DATABASE_URL, unappliedMigrations } from './prelaunch-tripwire.ts';

export type GuardCommand = (name: string, args: string[], env?: NodeJS.ProcessEnv) => string;

export interface GuardResult {
  code: 0 | 1 | 2;
  reason: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

export function runDeployMigrationGuard(
  commitSha: string | undefined,
  password: string | undefined,
  command: GuardCommand
): GuardResult {
  if (!commitSha || !FULL_SHA.test(commitSha))
    return { code: 2, reason: `COMMIT_SHA is not a full commit sha: ${commitSha ?? '(unset)'}` };
  if (!password) return { code: 2, reason: 'PGPASSWORD is not set' };
  let files: string;
  let rows: string;
  try {
    files = command('git', ['ls-tree', '-r', '--name-only', `${commitSha}:supabase/migrations`]);
  } catch {
    return { code: 2, reason: `could not list supabase/migrations at ${commitSha}` };
  }
  try {
    // Only the password reaches psql, so no PG* variable can redirect it.
    rows = command(
      'psql',
      [
        MYK9_DATABASE_URL,
        '-X',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        'select version from supabase_migrations.schema_migrations;',
      ],
      { PATH: process.env.PATH, PGPASSWORD: password }
    );
  } catch {
    return { code: 2, reason: 'could not read supabase_migrations.schema_migrations' };
  }
  const applied = rows
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);
  if (!applied.length || !applied.every(v => /^\d+$/.test(v)))
    return { code: 2, reason: 'schema_migrations returned no rows or a malformed version' };
  const missing = unappliedMigrations(files.split('\n'), applied);
  if (missing.length)
    return {
      code: 1,
      reason: `${commitSha} carries migration(s) not applied to the database: ${missing.join(', ')}; run supabase db push first (owner-authorized), then deploy`,
    };
  return { code: 0, reason: `every migration on ${commitSha} is applied` };
}

function run(name: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync(name, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    timeout: 30_000,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runDeployMigrationGuard(process.env.COMMIT_SHA, process.env.PGPASSWORD, run);
  console.log(
    `deploy-migration-guard: ${result.code === 0 ? 'PASS' : 'STOP'} (exit ${result.code}): ${result.reason}`
  );
  process.exitCode = result.code;
}
