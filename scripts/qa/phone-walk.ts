/**
 * MYK9-1787: which PRs need the phone-width walk green before the review gate is posted.
 *
 * The walk is `apps/myk9show/src/test/e2e/verification/ringsidePhoneWalk.spec.ts`. It runs
 * on every PR inside the "Isolated scoring and paperwork verification" workflow (job
 * `proof`), against the branch build and a disposable local Supabase. That workflow is not a
 * required check, so a ringside PR could merge with the walk red; this script is what makes
 * `ship-pr` wait for it on the PRs that touch a ringside or check-in desk surface.
 *
 * A declared list, never inference over file contents: a path that no longer exists exits 2
 * instead of silently matching nothing (LESSONS #comment-satisfies-grep).
 *
 *   pnpm qa:phone-walk [--base origin/main]   is the walk required for this diff?
 *   pnpm qa:phone-walk --pr <n>               ...and if so, is it green on the PR head?
 *
 * The verdict is the walk STEP's own conclusion inside the `proof` job (MYK9-1946), read
 * from the job's step list. The job as a whole also runs unrelated specs; one of those
 * failing must not block the gate. Fail closed: no job, no step, or a step that did not
 * succeed is never green.
 *
 * Exit: 0 not required, or required and green · 1 required and failed · 2 could not decide
 * (a declared path is gone, the PR head is not local HEAD, a bad flag, or git/gh failed) ·
 * 3 required and not finished (not a verdict).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WALK_SPEC = 'apps/myk9show/src/test/e2e/verification/ringsidePhoneWalk.spec.ts';
export const WALK_CONFIG = 'apps/myk9show/playwright.batch3.config.ts';
export const WALK_WORKFLOW = 'Isolated scoring and paperwork verification';
export const WALK_JOB = 'proof';
/** The workflow step that runs only the walk spec (MYK9-1946). Rename together with the workflow. */
export const WALK_STEP = 'Phone-width ringside walk';
export const WALK_WORKFLOW_FILE = '.github/workflows/batch3-verification.yml';

/**
 * Ringside and check-in desk surfaces. A trailing slash is a directory prefix; anything else
 * is one file. Every entry must exist in the tree.
 */
export const PHONE_WALK_PATHS: readonly string[] = [
  'packages/ringside/',
  'packages/scoring-ui/',
  'apps/myk9show/src/features/at-show/',
  'apps/myk9show/src/components/entries/management/checkInDesk/',
  'apps/myk9show/src/services/show-day/',
  'apps/myk9show/src/pages/scoring/',
  'apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts',
  'apps/myk9show/src/services/replication/entryRingTime.ts',
  'apps/myk9show/src/hooks/useScoresheetRingMove.ts',
  'apps/myk9show/src/utils/checkInTransitions.ts',
  WALK_SPEC,
  WALK_CONFIG,
];

/** Declared paths that are not in the tree: a rename has left the list matching nothing. */
export function missingPaths(
  exists: (path: string) => boolean,
  paths: readonly string[] = PHONE_WALK_PATHS
): string[] {
  return paths.filter(path => !exists(path));
}

/** The changed files that sit on a declared surface. */
export function walkMatches(
  files: readonly string[],
  paths: readonly string[] = PHONE_WALK_PATHS
): string[] {
  return files.filter(file =>
    paths.some(path => (path.endsWith('/') ? file.startsWith(path) : file === path))
  );
}

/** True when the suite that CI runs still includes the walk. */
export function configRunsWalk(configSource: string): boolean {
  // Line comments go first, so a commented-out entry inside the array does not count.
  const code = configSource.replace(/\/\/.*$/gm, '');
  const list = /testMatch:\s*\[([^\]]*)\]/.exec(code)?.[1] ?? '';
  const entries = [...list.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  return entries.includes('**/ringsidePhoneWalk.spec.ts');
}

export interface PrCheck {
  name: string;
  workflow: string;
  bucket: string;
  link?: string;
}

export interface JobStep {
  name: string;
  status: string;
  conclusion: string | null;
}

/** True when the workflow still has a step of the walk's name that runs the walk spec. */
export function workflowRunsWalkStep(workflowSource: string): boolean {
  const at = workflowSource.indexOf(`name: ${WALK_STEP}`);
  if (at === -1) return false;
  const rest = workflowSource.slice(at + 1);
  const next = rest.search(/\n {6}- /);
  const block = next === -1 ? rest : rest.slice(0, next);
  return /^\s*run:.*ringsidePhoneWalk/m.test(block.replace(/^\s*#.*$/gm, ''));
}

/** `https://github.com/<owner>/<repo>/actions/runs/<run>/job/<job>` -> repo and job id. */
export function parseJobLink(link: string | undefined): { repo: string; jobId: string } | null {
  const match = /github\.com\/([^/]+\/[^/]+)\/actions\/runs\/\d+\/job\/(\d+)/.exec(link ?? '');
  return match ? { repo: match[1] as string, jobId: match[2] as string } : null;
}

/** The current attempt of the walk's job: the highest job id (a re-run gets a new one). */
export function currentWalkRun(checks: readonly PrCheck[]): PrCheck | undefined {
  const runs = checks.filter(check => check.workflow === WALK_WORKFLOW && check.name === WALK_JOB);
  const id = (check: PrCheck) => Number(parseJobLink(check.link)?.jobId ?? 0);
  return [...runs].sort((a, b) => id(b) - id(a))[0];
}

export interface Verdict {
  code: 0 | 1 | 2 | 3;
  message: string;
}

/**
 * Read the walk off a PR's checks and the job's steps. `steps` is the step list of the
 * current `proof` job, or null when it could not be read. Anything but a finished pass of
 * the walk step is not green.
 */
export function walkVerdict(
  checks: readonly PrCheck[],
  steps: readonly JobStep[] | null = null
): Verdict {
  const run = currentWalkRun(checks);
  if (!run) {
    return {
      code: 3,
      message: `no "${WALK_WORKFLOW}" run on this head yet (a PR that conflicts with its base never gets one)`,
    };
  }
  const finished = run.bucket !== 'pending';
  if (steps === null) {
    return { code: 2, message: `could not read the steps of the "${WALK_JOB}" job` };
  }
  const step = steps.find(entry => entry.name === WALK_STEP);
  if (!step) {
    return finished
      ? {
          code: 2,
          message: `the "${WALK_JOB}" job has no "${WALK_STEP}" step (renamed or removed?)`,
        }
      : { code: 3, message: 'the walk has not started on this head' };
  }
  if (step.status !== 'completed')
    return { code: 3, message: 'the walk has not finished on this head' };
  if (step.conclusion === 'success') return { code: 0, message: 'the walk is green on this head' };
  if (step.conclusion === 'skipped' && !finished) {
    return { code: 3, message: 'the walk has not finished on this head' };
  }
  return {
    code: 1,
    message: `the walk did not pass on this head (step conclusion: ${step.conclusion ?? 'none'})`,
  };
}

/** A flag's value, undefined when the flag is absent. A flag with no value is an error. */
export function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

const run = (command: string, args: string[]): string =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The steps of the current walk job via REST (GraphQL is refused in cloud sessions), or null. */
function readWalkSteps(checks: readonly PrCheck[]): JobStep[] | null {
  const job = parseJobLink(currentWalkRun(checks)?.link);
  if (!job) return null;
  try {
    const out = run('gh', ['api', `repos/${job.repo}/actions/jobs/${job.jobId}`, '--jq', '.steps']);
    const steps: unknown = JSON.parse(out);
    return Array.isArray(steps) ? (steps as JobStep[]) : null;
  } catch {
    return null;
  }
}

function main(): number {
  const base = readFlag(process.argv, '--base') ?? 'origin/main';
  const pr = readFlag(process.argv, '--pr');
  const root = run('git', ['rev-parse', '--show-toplevel']);
  const gone = missingPaths(path => existsSync(resolve(root, path)));
  if (gone.length > 0) {
    console.error(`phone walk: declared path no longer exists: ${gone.join(', ')}`);
    console.error('Update PHONE_WALK_PATHS in scripts/qa/phone-walk.ts to where the code moved.');
    return 2;
  }
  if (!configRunsWalk(readFileSync(resolve(root, WALK_CONFIG), 'utf8'))) {
    console.error(`phone walk: ${WALK_CONFIG} no longer runs ringsidePhoneWalk.spec.ts`);
    return 2;
  }
  if (!workflowRunsWalkStep(readFileSync(resolve(root, WALK_WORKFLOW_FILE), 'utf8'))) {
    console.error(`phone walk: ${WALK_WORKFLOW_FILE} has no "${WALK_STEP}" step running the walk`);
    return 2;
  }

  const changed = run('git', ['diff', '--name-only', `${base}...HEAD`])
    .split('\n')
    .filter(Boolean);
  const matches = walkMatches(changed);
  if (matches.length === 0) {
    console.log('phone walk: not required (no ringside or check-in desk path changed)');
    return 0;
  }
  console.log(`phone walk: required (${matches.length} file(s), first: ${matches[0]})`);

  if (!pr) return 0;
  // The diff above is local; the checks below are the PR's. They must be the same commit.
  const local = run('git', ['rev-parse', 'HEAD']);
  const remote = run('gh', ['pr', 'view', pr, '--json', 'headRefOid', '-q', '.headRefOid']);
  if (local !== remote) {
    console.error(`phone walk: PR ${pr} head ${remote} is not local HEAD ${local}; push or pull`);
    return 2;
  }
  let checks: PrCheck[];
  try {
    // `gh pr checks` exits non-zero while checks are pending or failed and still prints them.
    const out = execFileSync('gh', ['pr', 'checks', pr, '--json', 'name,workflow,bucket,link'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    checks = JSON.parse(out) as PrCheck[];
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout ?? '';
    try {
      checks = JSON.parse(stdout) as PrCheck[];
    } catch {
      console.error(`phone walk: could not read checks for PR ${pr}`);
      return 2;
    }
  }
  const verdict = walkVerdict(checks, readWalkSteps(checks));
  console.log(`phone walk: ${verdict.message}`);
  return verdict.code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let code: number;
  try {
    code = main();
  } catch (error) {
    // A bad flag, a missing base ref or a failed git/gh call is "could not decide", never 1.
    console.error(`phone walk: could not decide: ${(error as Error).message.split('\n')[0]}`);
    code = 2;
  }
  process.exit(code);
}
