/**
 * Pre-launch tripwire for standing approvals (MYK9-1485).
 *
 * While myK9 has no real club, agents may merge, deploy, `db push` and deploy
 * functions without asking (docs/agents/standing-approvals.md). This runs
 * before each of those and exits:
 *   0  standing approvals are ACTIVE, Stripe is in test mode, every club is a
 *      known test club, and no named migration drops or deletes data
 *   1  one of those is false (the reason names which): do not run the action
 *   2  it could not decide (no database URL, a failed query, a missing or
 *      malformed approvals block): do not run the action either
 *
 * The approvals file is read fresh on every run, so flipping the switch takes
 * effect on the next action. Database access is read-only, through psql with
 * MYK9_MIGRATION_DATABASE_URL (and PGPASSWORD), as the db-push skill does.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface Approvals {
  active: boolean;
  testClubIds: string[];
}

export interface TripwireFacts {
  /** platform_settings.stripe_livemode; null when unreadable. */
  livemode: boolean | null;
  /** Every public.clubs id, soft-deleted included; null when unreadable. */
  clubIds: string[] | null;
  migrations?: { path: string; sql: string }[];
}

export interface TripwireResult {
  code: 0 | 1 | 2;
  reason: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCK = /```standing-approvals\n([\s\S]*?)```/g;

/** The one `standing-approvals` fenced block, or null when it is missing, duplicated or malformed. */
export function parseApprovals(markdown: string): Approvals | null {
  const blocks = [...markdown.matchAll(BLOCK)];
  if (blocks.length !== 1) return null;
  const lines = (blocks[0]?.[1] ?? '').split('\n').map(l => l.trim());
  const status = lines
    .find(l => l.startsWith('status:'))
    ?.slice('status:'.length)
    .trim();
  if (status !== 'ACTIVE' && status !== 'OFF') return null;
  const start = lines.indexOf('test-clubs:');
  if (start === -1) return null;
  const testClubIds: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line) continue;
    if (!line.startsWith('- ')) break;
    const id = line.slice(2).trim();
    if (!UUID.test(id)) return null;
    testClubIds.push(id.toLowerCase());
  }
  return { active: status === 'ACTIVE', testClubIds };
}

/** Statements that drop or delete data. Comments are ignored; a quoted mention errs toward a stop. */
export function destructiveStatements(sql: string): string[] {
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  return code
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (/\b(drop\s+table|drop\s+column|truncate)\b/i.test(s)) return true;
      return /\bdelete\s+from\b/i.test(s) && !/\bwhere\b/i.test(s);
    });
}

export function evaluateTripwire(
  approvals: Approvals | null,
  facts: TripwireFacts
): TripwireResult {
  if (!approvals)
    return { code: 2, reason: 'the standing-approvals approvals block is missing or malformed' };
  if (!approvals.active) return { code: 1, reason: 'standing approvals are OFF' };
  if (facts.livemode === null) return { code: 2, reason: 'could not read stripe_livemode' };
  if (facts.livemode) return { code: 1, reason: 'Stripe is in live mode: real money exists' };
  if (facts.clubIds === null) return { code: 2, reason: 'could not read public.clubs' };
  const known = new Set(approvals.testClubIds);
  const unknown = facts.clubIds.filter(id => !known.has(id.toLowerCase()));
  if (unknown.length)
    return { code: 1, reason: `club(s) not on the test-club list: ${unknown.join(', ')}` };
  for (const m of facts.migrations ?? []) {
    const hits = destructiveStatements(m.sql);
    if (hits.length) return { code: 1, reason: `${m.path} drops or deletes data: ${hits[0]}` };
  }
  return { code: 0, reason: 'standing approvals apply' };
}

export type Command = (name: string, args: string[]) => string;

export interface RunOptions {
  approvalsPath: string;
  migrationPaths: string[];
  env: NodeJS.ProcessEnv;
  command: Command;
}

/** Read everything fresh and evaluate. Never throws: a failure is a code-2 result. */
export function runTripwire(options: RunOptions): TripwireResult {
  let approvals: Approvals | null;
  try {
    approvals = parseApprovals(readFileSync(options.approvalsPath, 'utf8'));
  } catch {
    approvals = null;
  }
  const url = options.env.MYK9_MIGRATION_DATABASE_URL;
  if (approvals?.active && !url)
    return { code: 2, reason: 'MYK9_MIGRATION_DATABASE_URL is not set' };
  const query = (sql: string): string | null => {
    try {
      return options.command('psql', [
        url ?? '',
        '-X',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ]);
    } catch {
      return null;
    }
  };
  const live = approvals?.active
    ? query('select stripe_livemode from public.platform_settings where id = true;')
    : 'f';
  const livemode =
    live === null ? null : live.trim() === 't' ? true : live.trim() === 'f' ? false : null;
  const clubs = approvals?.active ? query('select id from public.clubs;') : '';
  const clubIds =
    clubs === null
      ? null
      : clubs
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
  let migrations: { path: string; sql: string }[];
  try {
    migrations = options.migrationPaths.map(p => ({
      path: basename(p),
      sql: readFileSync(p, 'utf8'),
    }));
  } catch (error) {
    return { code: 2, reason: `could not read a migration: ${(error as Error).message}` };
  }
  return evaluateTripwire(approvals, { livemode, clubIds, migrations });
}

function main(argv: string[]): number {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const migrationPaths: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--migration' && argv[i + 1]) migrationPaths.push(argv[(i += 1)] ?? '');
  }
  const result = runTripwire({
    approvalsPath: join(repoRoot, 'docs', 'agents', 'standing-approvals.md'),
    migrationPaths,
    env: process.env,
    command: (name, args) =>
      execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  });
  console.log(
    `prelaunch-tripwire: ${result.code === 0 ? 'PASS' : 'STOP'} (exit ${result.code}): ${result.reason}`
  );
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
