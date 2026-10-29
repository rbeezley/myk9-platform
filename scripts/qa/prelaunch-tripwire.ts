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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/**
 * SQL with single-quoted strings and comments blanked out, in one left-to-right
 * pass, so a `--` or `/*` inside a string cannot hide the code after it.
 * Dollar-quoted bodies (`DO $$ … $$`) are code and stay.
 */
function codeOnly(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      i += 1;
      while (i < sql.length && !(sql[i] === "'" && sql[i + 1] !== "'")) i += sql[i] === "'" ? 2 : 1;
      i += 1;
      out += "''";
    } else if (sql.startsWith('--', i)) {
      while (i < sql.length && sql[i] !== '\n') i += 1;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** `ALTER TABLE … DROP <x>` that removes a column (the COLUMN keyword is optional). */
const ALTER_DROP =
  /\balter\s+table\b[\s\S]*?\bdrop\s+(?!constraint\b|default\b|not\s+null\b|identity\b|expression\b)/i;

/** Statements that drop or delete data. Comments and string contents are ignored. */
export function destructiveStatements(sql: string): string[] {
  return codeOnly(sql)
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (/\b(drop\s+(table|schema|column)|truncate)\b/i.test(s) || ALTER_DROP.test(s)) return true;
      if (!/\bdelete\s+from\b/i.test(s)) return false;
      return !/\bwhere\b/i.test(s) || /\bwhere\s+(true|1\s*=\s*1)\s*$/i.test(s);
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
  /** This checkout's docs/agents/standing-approvals.md. */
  approvalsPath: string;
  /** supabase/migrations, scanned for unpushed files with --db-push. */
  migrationsDir: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  /** Runs git and psql; injectable for tests. */
  command: Command;
}

const APPROVALS_ON_MAIN = 'origin/main:docs/agents/standing-approvals.md';

/**
 * The stricter of this checkout's switch and main's: both must be ACTIVE, and a
 * club counts as a test club only when both lists name it. A worktree cut before
 * the owner merged `status: OFF` must not keep acting (final review, MYK9-1485).
 */
function combine(local: Approvals | null, main: Approvals | null): Approvals | null {
  if (!local || !main) return null;
  return {
    active: local.active && main.active,
    testClubIds: local.testClubIds.filter(id => main.testClubIds.includes(id)),
  };
}

/** Read everything fresh and evaluate. Never throws: a failure is a code-2 result. */
export function runTripwire(options: RunOptions): TripwireResult {
  const dbPush = options.argv.length === 1 && options.argv[0] === '--db-push';
  if (options.argv.length && !dbPush)
    return { code: 2, reason: `unknown arguments: ${options.argv.join(' ')} (only --db-push)` };
  const read = (load: () => string): Approvals | null => {
    try {
      return parseApprovals(load());
    } catch {
      return null;
    }
  };
  const local = read(() => readFileSync(options.approvalsPath, 'utf8'));
  const onMain = read(() => {
    options.command('git', ['fetch', '-q', 'origin', 'main']);
    return options.command('git', ['show', APPROVALS_ON_MAIN]);
  });
  const approvals = combine(local, onMain);
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
  let migrations: { path: string; sql: string }[] = [];
  if (dbPush && approvals?.active) {
    // `supabase db push` applies every unpushed file, so scan all of them, not just this branch's.
    const applied = query('select version from supabase_migrations.schema_migrations;');
    if (applied === null) return { code: 2, reason: 'could not read schema_migrations' };
    const done = new Set(applied.split('\n').map(s => s.trim()));
    try {
      migrations = readdirSync(options.migrationsDir)
        .filter(f => /^\d{14}_.*\.sql$/.test(f) && !done.has(f.slice(0, 14)))
        .map(f => ({ path: f, sql: readFileSync(join(options.migrationsDir, f), 'utf8') }));
    } catch (error) {
      return { code: 2, reason: `could not read migrations: ${(error as Error).message}` };
    }
  }
  return evaluateTripwire(approvals, { livemode, clubIds, migrations });
}

function main(argv: string[]): number {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = runTripwire({
    approvalsPath: join(repoRoot, 'docs', 'agents', 'standing-approvals.md'),
    migrationsDir: join(repoRoot, 'supabase', 'migrations'),
    argv,
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
