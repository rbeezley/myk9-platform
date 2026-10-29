/**
 * Pre-launch tripwire for standing approvals (MYK9-1485).
 *
 * While myK9 has no real club, agents may merge, run Deploy myK9Show and deploy
 * functions without asking (docs/agents/standing-approvals.md). `db push` is
 * not pre-approved: no scan of arbitrary SQL can promise a migration keeps
 * data (Codex review, PR #3393). This runs before each pre-approved action and exits:
 *   0  standing approvals are ACTIVE, Stripe is in test mode, and every club is
 *      a known test club, read from the myK9 project itself; with
 *      --functions-deploy, also the checkout is clean and at origin/main
 *   1  one of those is false (the reason names which): do not run the action
 *   2  it could not decide (no PGPASSWORD, a failed query, a missing or
 *      malformed approvals block): do not run the action either
 *
 * The approvals file is read fresh on every run, so flipping the switch takes
 * effect on the next action. Database access is read-only, through psql to the
 * fixed myK9 pooler address below; only PGPASSWORD comes from the environment.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  return { code: 0, reason: 'standing approvals apply' };
}

export type Command = (name: string, args: string[], env?: NodeJS.ProcessEnv) => string;

export interface RunOptions {
  /** This checkout's docs/agents/standing-approvals.md. */
  approvalsPath: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  /** Runs git and psql; injectable for tests. */
  command: Command;
}

const APPROVALS_ON_MAIN = 'origin/main:docs/agents/standing-approvals.md';
/**
 * The myK9 project, fixed here rather than read from the environment: any other
 * database could be in test mode while production is not, and no check of a
 * caller-supplied URL proved airtight (Codex review, PR #3393).
 */
const MYK9_DATABASE_URL =
  'postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres';

/** The caller's environment minus every libpq `PG*` variable but the password, so none can redirect psql. */
function psqlEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith('PG') || key === 'PGPASSWORD')
  );
}

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
  const functionsDeploy = options.argv.length === 1 && options.argv[0] === '--functions-deploy';
  if (options.argv.length && !functionsDeploy)
    return {
      code: 2,
      reason: `unknown arguments: ${options.argv.join(' ')} (only --functions-deploy)`,
    };
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
  // Without a password psql would prompt on a terminal and hang.
  if (approvals?.active && !options.env.PGPASSWORD)
    return { code: 2, reason: 'PGPASSWORD is not set (source supabase/.env)' };
  const query = (sql: string): string | null => {
    try {
      return options.command(
        'psql',
        [MYK9_DATABASE_URL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
        psqlEnv(options.env)
      );
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
  const result = evaluateTripwire(approvals, { livemode, clubIds });
  if (result.code !== 0 || !functionsDeploy) return result;
  // `supabase functions deploy` uploads the local files, so they must be exactly main's.
  try {
    if (options.command('git', ['status', '--porcelain']).trim())
      return { code: 1, reason: 'the checkout has uncommitted changes; deploy from origin/main' };
    const head = options.command('git', ['rev-parse', 'HEAD']).trim();
    if (head !== options.command('git', ['rev-parse', 'origin/main']).trim())
      return { code: 1, reason: `the checkout is at ${head}, not origin/main` };
  } catch (error) {
    return { code: 2, reason: `could not read the checkout: ${(error as Error).message}` };
  }
  return result;
}

function main(argv: string[]): number {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = runTripwire({
    approvalsPath: join(repoRoot, 'docs', 'agents', 'standing-approvals.md'),
    argv,
    env: process.env,
    command: (name, args, env) =>
      execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }),
  });
  console.log(
    `prelaunch-tripwire: ${result.code === 0 ? 'PASS' : 'STOP'} (exit ${result.code}): ${result.reason}`
  );
  return result.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
