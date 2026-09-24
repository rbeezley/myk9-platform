/**
 * Launcher pin for the risk-tiered review gate.
 *
 * `scripts/qa/review-tier.ts` floors every guard under `scripts/qa/` at
 * `independent`. The files that INVOKE those guards do not sit at that floor:
 *
 *   - root `package.json` — its `qa:*` scripts are the launcher for every
 *     guard in `scripts/qa/`. Flooring the whole file at `independent` would
 *     also floor every dependency bump, the highest-frequency PR here and
 *     exactly the cost the tiering exists to avoid.
 *   - `vitest.config.mts` — its root project's
 *     `include: ['scripts/**\/*.test.{ts,tsx}']` decides whether the gate's
 *     own tests run at all.
 *
 * So a PR could neuter a guard (point `qa:review-gate:test` at `true`, or drop
 * the include) and clear the gate on two self-typed adversarial lens names.
 * Same shape as the `.githooks/` finding (M1, fallback review of #2243).
 *
 * The fix is this file, which lives UNDER `scripts/qa/` and therefore floors at
 * `independent` itself. Neutering a guard now requires editing BOTH
 * `package.json` (`adversarial`) AND this pin (`independent`), and
 * highest-floor-wins makes such a PR `independent`. A pure dependency bump
 * touches neither and stays `adversarial`.
 *
 * The guard list is DERIVED from the required CI jobs, never hand-maintained:
 * a hand list silently stops covering a job the moment CI grows a step, and a
 * test that covers nothing passes vacuously (LESSONS #comment-satisfies-grep).
 * Every parser below throws rather than returning an empty result, and
 * `MIN_PINNED_INVOCATIONS` is a hard floor under the extraction so a
 * zero-match parse can never read as "nothing to check".
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const WORKFLOW_PATH = '.github/workflows/ci.yml';
export const VITEST_CONFIG_PATH = 'vitest.config.mts';

/**
 * The checks the `main-required-checks` ruleset requires. `watch-pr-checks.sh`
 * reads the live ruleset over the network; this pin cannot (tests here are
 * offline), so the names are recorded and every one is asserted to resolve to
 * a real job `name:` in the workflow — a rename on either side goes red.
 */
export const REQUIRED_JOB_NAMES: readonly string[] = [
  'Quality Checks',
  'Test',
  'A11y smoke',
  'E2E PR Smoke',
];

/**
 * The root vitest project's include. Without it NO `scripts/**` test runs,
 * including every guard contract in the `Quality Checks` job.
 */
export const VITEST_ROOT_INCLUDE = "include: ['scripts/**/*.test.{ts,tsx}']";

/** A `pnpm <script>` invocation resolved to the package.json that defines it. */
export interface PinnedScript {
  /** Workspace-relative directory of the owning package.json. */
  readonly pkgDir: string;
  readonly script: string;
  /** The command text the script must still resolve to. */
  readonly command: string;
}

/**
 * Every `pnpm <script>` a required job invokes, with the command it must still
 * resolve to. Repointing any of these at `true` turns the contract test red.
 */
export const PINNED_SCRIPTS: readonly PinnedScript[] = [
  {
    pkgDir: '.',
    script: 'typecheck',
    command: 'pnpm run typecheck:scripts && turbo typecheck',
  },
  {
    pkgDir: '.',
    script: 'qa:typecheck-scripts:test',
    command: 'vitest run scripts/qa/typecheck-scripts.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:deferred-reviews:test',
    command: 'vitest run scripts/qa/deferred-reviews.test.ts',
  },
  { pkgDir: '.', script: 'lint', command: 'turbo lint' },
  {
    pkgDir: '.',
    script: 'format:check:changed',
    command: 'bash scripts/qa/format-changed.sh --check origin/main',
  },
  { pkgDir: 'apps/myk9show', script: 'test:load:unit', command: 'vitest run src/test/load' },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:load:list',
    command: 'playwright test --config=playwright.load.config.ts --list',
  },
  {
    pkgDir: '.',
    script: 'qa:browser-session:test',
    command: 'tsx --test scripts/qa/browser-session.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:nightly:workflow:test',
    command: 'vitest run scripts/qa/nightly-health-workflow.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:backups:typecheck',
    command: 'tsc --noEmit -p scripts/backup/tsconfig.json',
  },
  {
    pkgDir: '.',
    script: 'qa:backups:test',
    command: 'vitest run scripts/backup --sequence.shuffle',
  },
  { pkgDir: '.', script: 'qa:e2e-map:check', command: 'node scripts/check-e2e-suite-map.js' },
  {
    pkgDir: '.',
    script: 'qa:sql:behavioral:test',
    command: 'vitest run scripts/qa/run-behavioral-sql-tests.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:pr-checks:test',
    command: 'vitest run scripts/qa/watch-pr-checks.test.ts',
  },
  { pkgDir: '.', script: 'qa:pr-checks', command: 'bash scripts/qa/watch-pr-checks.sh' },
  {
    pkgDir: '.',
    script: 'qa:ci-coverage-gate:test',
    command: 'vitest run scripts/qa/ci-coverage-gate.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:gating-jobs:test',
    command: 'vitest run scripts/qa/evaluate-gating-jobs.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:bulk-pii:test',
    command: 'vitest run scripts/qa/check-bulk-pii.test.ts',
  },
  { pkgDir: '.', script: 'qa:bulk-pii', command: 'tsx scripts/qa/check-bulk-pii.ts' },
  {
    pkgDir: '.',
    script: 'qa:review-gate:test',
    command: 'vitest run scripts/qa/review-gate.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:review-tier:test',
    command: 'vitest run scripts/qa/review-tier.test.ts',
  },
  // This pin's own contract test. Self-covering on purpose: dropping the CI
  // step that runs it is itself a drift the pin reports.
  {
    pkgDir: '.',
    script: 'qa:launcher-pin:test',
    command: 'vitest run scripts/qa/required-job-launchers.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:codex-review:test',
    command: 'vitest run scripts/qa/codex-review.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:post-review-gate:test',
    command: 'vitest run scripts/qa/post-review-gate.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:claude-review:test',
    command: 'vitest run scripts/qa/claude-review.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:dist-fresh:test',
    command: 'vitest run scripts/qa/check-dist-fresh.test.ts',
  },
  { pkgDir: '.', script: 'qa:inflight:test', command: 'vitest run scripts/qa/inflight.test.ts' },
  {
    pkgDir: '.',
    script: 'qa:primary-checkout:test',
    command: 'vitest run scripts/qa/primary-checkout.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:ci-concurrency:test',
    command: 'vitest run scripts/qa/ci-concurrency.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:shared-rules:test',
    command: 'vitest run scripts/qa/sync-shared-rules.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:shared-rules',
    command:
      'node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/qa/sync-shared-rules.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:prompt-parity:test',
    command: 'vitest run scripts/qa/check-prompt-parity.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:code-quality-ratchet',
    command: 'tsx scripts/qa/code-quality-ratchet.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:doc-staleness:strict',
    command: 'node scripts/check-doc-staleness.js --strict',
  },
  { pkgDir: '.', script: 'qa:plans:test', command: 'vitest run scripts/qa/plan-metadata.test.ts' },
  { pkgDir: '.', script: 'qa:plans', command: 'node --import tsx scripts/qa/plan-metadata.ts' },
  {
    pkgDir: '.',
    script: 'qa:types-drift:test',
    command: 'vitest run scripts/qa/supabase-types-drift.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:migrations:guard:test',
    command:
      'vitest run scripts/qa/migration-version-guard.test.ts scripts/qa/migration-version-guard.provenance.test.ts',
  },
  {
    pkgDir: '.',
    script: 'qa:migrations:guard',
    command: 'tsx scripts/qa/migration-version-guard.ts',
  },
  {
    pkgDir: '.',
    script: 'test:packages',
    command:
      'turbo test --filter=@myk9/core --filter=@myk9/replication --filter=@myk9/ringside --filter=@myk9/scoring --filter=@myk9/scoring-ui --filter=@myk9/supabase --filter=@myk9/ui',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'coverage:ratchet',
    command: 'tsx scripts/coverage-ratchet.ts',
  },
  { pkgDir: '.', script: 'build', command: 'turbo build' },
  {
    pkgDir: 'apps/myk9show',
    script: 'budget:check',
    command: 'node scripts/check-bundle-budget.js',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:a11y',
    command: 'cross-env PLAYWRIGHT_A11Y=true playwright test --config=playwright.ci.config.ts',
  },
  {
    pkgDir: 'apps/myk9show',
    script: 'test:e2e:ci',
    command: 'npx playwright test --config=playwright.ci.config.ts',
  },
];

/**
 * pnpm invocations in required jobs that are NOT package scripts (`install`,
 * `exec`, recursive builds). They cannot be neutered from `package.json`, but
 * they are pinned verbatim so the extraction stays EXHAUSTIVE: adding any new
 * `pnpm …` line to a required job fails until it is classified here or above.
 */
export const PINNED_RAW_INVOCATIONS: readonly string[] = [
  'pnpm install --frozen-lockfile',
  "pnpm -r --filter='./packages/*' build",
  "pnpm exec vitest run --reporter=default --reporter=blob --outputFile.blob=.vitest-reports/shard-${{ matrix.shard }}.json --exclude '**/integration/**' --exclude '**/debug-*.test.*' --sequence.shuffle --shard=${{ matrix.shard }}/6 --coverage",
  'pnpm exec vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary --mergeReports=.vitest-reports',
  'pnpm exec tsx scripts/verify-e2e-auth-preflight.ts secretary admin judge',
  'pnpm exec tsx scripts/verify-e2e-auth-preflight.ts secretary exhibitor',
  'pnpm --filter @myk9/show exec playwright install --with-deps chromium',
];

/**
 * Hard floor under the extraction, well below the real count but far above
 * zero. A regex parse that stops matching yields an EMPTY list, and an empty
 * list satisfies every "each extracted invocation is pinned" assertion
 * vacuously. This is the assertion that cannot pass on nothing.
 */
export const MIN_PINNED_INVOCATIONS = 30;

export interface WorkflowJob {
  readonly id: string;
  readonly name: string;
  readonly needs: readonly string[];
  /** Every `pnpm …` command in the job's `run:` blocks, with its workdir. */
  readonly invocations: readonly { command: string; workdir: string }[];
}

const JOB_ID = /^ {2}([A-Za-z0-9_-]+):\s*$/;
const JOB_FIELD = /^ {4}([A-Za-z0-9_-]+):\s*(.*)$/;
const STEP_START = /^ {6}- /;
const STEP_FIELD = /^ {8,}([A-Za-z0-9_-]+):\s*(.*)$/;

/** Split a shell line into `pnpm …` segments, honouring `&&` / `;` chains. */
function pnpmSegments(line: string): string[] {
  return line
    .split(/&&|;/)
    .map(s => s.trim())
    .filter(s => /^pnpm(\s|$)/.test(s));
}

/**
 * Parse `.github/workflows/ci.yml` into jobs. THROWS on a parse that finds
 * nothing — a silent empty result is the exact bug this module guards against.
 */
export function parseWorkflow(text: string): WorkflowJob[] {
  const lines = text.split('\n');
  const jobsAt = lines.findIndex(l => /^jobs:\s*$/.test(l));
  if (jobsAt === -1) throw new Error(`${WORKFLOW_PATH}: no top-level \`jobs:\` key — parse failed`);

  const jobs: WorkflowJob[] = [];
  let current: {
    id: string;
    name?: string;
    needs: string[];
    invocations: { command: string; workdir: string }[];
  } | null = null;
  let inSteps = false;
  let stepWorkdir = '.';
  let runIndent = -1;

  const flush = (): void => {
    if (!current) return;
    if (!current.name) throw new Error(`${WORKFLOW_PATH}: job \`${current.id}\` has no \`name:\``);
    jobs.push({
      id: current.id,
      name: current.name,
      needs: current.needs,
      invocations: current.invocations,
    });
  };

  for (const line of lines.slice(jobsAt + 1)) {
    if (/^\S/.test(line) && line.trim() !== '') break; // left the `jobs:` block

    // Inside a `run: |` block? Collect until the indentation drops.
    if (runIndent >= 0) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() === '') continue;
      if (indent >= runIndent) {
        for (const seg of pnpmSegments(line))
          current?.invocations.push({ command: seg, workdir: stepWorkdir });
        continue;
      }
      runIndent = -1;
    }

    const jobMatch = JOB_ID.exec(line);
    if (jobMatch) {
      flush();
      current = { id: jobMatch[1]!, needs: [], invocations: [] };
      inSteps = false;
      stepWorkdir = '.';
      continue;
    }
    if (!current) continue;

    if (!inSteps) {
      const field = JOB_FIELD.exec(line);
      if (field) {
        if (field[1] === 'name') current.name = field[2]!.trim().replace(/^['"]|['"]$/g, '');
        if (field[1] === 'needs')
          current.needs = (field[2] ?? '')
            .replace(/[[\]]/g, '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (field[1] === 'steps') {
          inSteps = true;
          stepWorkdir = '.';
        }
        continue;
      }
    }
    if (!inSteps) continue;

    if (STEP_START.test(line)) stepWorkdir = '.';
    const stepLine = line.replace(STEP_START, '        ');
    const field = STEP_FIELD.exec(stepLine);
    if (!field) continue;
    if (field[1] === 'working-directory') stepWorkdir = field[2]!.trim();
    if (field[1] === 'run') {
      const rest = field[2]!.trim();
      if (rest === '|' || rest === '|-' || rest === '>' || rest === '>-') {
        runIndent = stepLine.length - stepLine.trimStart().length + 1;
      } else {
        for (const seg of pnpmSegments(rest))
          current.invocations.push({ command: seg, workdir: stepWorkdir });
      }
    }
  }
  flush();

  if (jobs.length === 0) throw new Error(`${WORKFLOW_PATH}: parsed 0 jobs — parse failed`);
  return jobs;
}

/** Required jobs plus everything they transitively `needs:`. */
export function gatingJobs(jobs: readonly WorkflowJob[]): WorkflowJob[] {
  const byName = new Map(jobs.map(j => [j.name, j]));
  const byId = new Map(jobs.map(j => [j.id, j]));
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const name of REQUIRED_JOB_NAMES) {
    const job = byName.get(name);
    if (!job)
      throw new Error(`${WORKFLOW_PATH}: required check "${name}" matches no job \`name:\``);
    queue.push(job.id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const job = byId.get(id);
    if (!job) throw new Error(`${WORKFLOW_PATH}: \`needs: ${id}\` names no job`);
    queue.push(...job.needs);
  }
  return jobs.filter(j => seen.has(j.id));
}

const PNPM_PASSTHROUGH = new Set(['install', 'exec', 'dlx', 'add', 'remove', 'why', 'store', 'i']);

/** Workspace package name → directory, so `--filter @myk9/show` resolves. */
export function workspaceDirs(root: string): Map<string, string> {
  const dirs = new Map<string, string>();
  for (const dir of ['.', 'apps/myk9show', 'apps/docs']) {
    const file = join(root, dir, 'package.json');
    if (!existsSync(file)) continue;
    const name = JSON.parse(readFileSync(file, 'utf8')).name;
    if (name) dirs.set(name, dir);
  }
  return dirs;
}

/**
 * Classify one `pnpm …` command: a package script (pinnable from a
 * package.json) or a raw pass-through invocation.
 */
export function classify(
  command: string,
  workdir: string,
  pkgDirs: ReadonlyMap<string, string>
): { kind: 'script'; pkgDir: string; script: string } | { kind: 'raw' } {
  const tokens = command.split(/\s+/).slice(1);
  let pkgDir = workdir;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token === '-r' || token === '--recursive' || token === '-w' || token === '--workspace-root')
      return { kind: 'raw' };
    if (token.startsWith('--filter')) {
      const value = token.includes('=') ? token.slice(token.indexOf('=') + 1) : tokens[++i];
      const cleaned = (value ?? '').replace(/^['"]|['"]$/g, '');
      const resolved = pkgDirs.get(cleaned);
      if (!resolved) return { kind: 'raw' };
      pkgDir = resolved;
      i++;
      continue;
    }
    if (token === '--dir' || token === '-C') {
      pkgDir = tokens[++i] ?? pkgDir;
      i++;
      continue;
    }
    if (token.startsWith('-')) {
      i++;
      continue;
    }
    if (PNPM_PASSTHROUGH.has(token)) return { kind: 'raw' };
    const script = token === 'run' ? tokens[i + 1] : token;
    if (!script) return { kind: 'raw' };
    return { kind: 'script', pkgDir, script };
  }
  return { kind: 'raw' };
}

export function readScripts(root: string, pkgDir: string): Record<string, string> {
  const file = join(root, pkgDir, 'package.json');
  if (!existsSync(file)) throw new Error(`no package.json at ${pkgDir}`);
  return JSON.parse(readFileSync(file, 'utf8')).scripts ?? {};
}
