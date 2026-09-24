/**
 * Risk map for the review gate: which tier of scrutiny a change's paths
 * require. Imported by BOTH scripts/qa/review-gate.ts (to refuse evidence
 * below the floor) and the qa:review-tier CLI (so an agent can learn the
 * floor BEFORE spending tokens on a review it does not need).
 *
 * Deliberately a short readable table, never inference over file contents:
 * a keyword scan would make the floor depend on prose, and prose about code
 * satisfies a text scan (LESSONS #comment-satisfies-grep).
 */
export type Tier = 'independent' | 'adversarial' | 'owner' | 'none';

/** Weakest to strongest. `owner` outranks `none` but is below `adversarial`. */
export const TIER_ORDER: readonly Tier[] = ['none', 'owner', 'adversarial', 'independent'];

export const MIGRATION_LENS = 'migration-auditor';

/**
 * Guardrails: a change here can disable what catches the next defect.
 *
 * `.githooks/` is here for the LAUNCHER reason, not only the content reason:
 * `.githooks/pre-push` is what invokes `scripts/qa/push-hold.ts` (itself
 * `independent`) and `.githooks/pre-commit` is what enforces the worktree
 * rule. The other launcher is root `package.json` — its `qa:*` scripts —
 * which CANNOT be floored here without flooring every dependency bump;
 * `scripts/qa/required-job-launchers.ts` pins it from inside this floor
 * instead. A guard at `independent` reached through a launcher that is not
 * leaves the guard perfectly reviewed and trivially unreachable — a PR
 * neutering the hook went green on two self-typed lens names (fallback review
 * of #2243, M1). When adding a guard, floor its ENTRYPOINT too.
 */
const INDEPENDENT_PATTERNS: readonly RegExp[] = [
  /^\.github\//,
  /^\.(claude|codex|agents)\//,
  /^\.githooks\//,
  /^scripts\/qa\//,
  /(^|\/)playwright[^/]*\.config\.ts$/,
  /^(CLAUDE|AGENTS)\.md$/,
  /^docs\/agents\/shared-rules\.md$/,
  /^supabase\/functions\//,
  /^packages\/replication\//,
  /(^|\/)(rls|grants?|policies)[^/]*\.(sql|ts)$/i,
  /(^|\/)(auth|rbac|permissions?|roles?)\//i,
  /(^|\/)(stripe|payout|refund|checkout|payments?)/i,
];

const MIGRATION_PATTERN = /^supabase\/migrations\//;

/**
 * True when ANY changed file is a migration. Deliberately NOT derived from
 * `requiredTier(...).reason`: `requiredTier` seeds `best` from the first file
 * and only replaces it on a STRICTLY higher tier, so a list of
 * `[app-code.tsx, migration.sql]` keeps the app-code reason even though a
 * migration is present — both resolve to `adversarial`. Reading the migration
 * rule off that reason string would therefore drop the mandatory
 * `migration-auditor` lens for exactly the mixed diffs most likely to have one.
 */
export function touchesMigration(files: readonly string[]): boolean {
  return files.some(file => MIGRATION_PATTERN.test(file));
}

/** Docs are the only `none`, and never the instruction files above. */
const NONE_PATTERNS: readonly RegExp[] = [/^docs\//, /^[^/]*\.md$/];

const DEPENDENCY_ONLY_PATTERNS: readonly RegExp[] = [
  /^package\.json$/,
  /^(apps|packages)\/[^/]+\/package\.json$/,
  /^pnpm-lock\.yaml$/,
];
const APP_SOURCE_PATTERN = /^apps\/[^/]+\/src\//;
/**
 * Tests and test support. Contract and guard tests live all over app source
 * (`src/test/database/*Contract*`, `entryCloseGuard.test.ts`,
 * `*.source.test.ts`), so no directory list can name them; a one-line
 * `it.skip` in any of them turns CI green while disabling what it guards.
 * On the bounded app route these paths qualify only when ADDED.
 */
const TEST_SUPPORT_PATTERN =
  /(^|\/)(test|tests|__tests__|__mocks__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SMALL_APP_FILE_LIMIT = 3;
const SMALL_APP_CHANGED_LINE_LIMIT = 100;

/**
 * The only package.json fields a dependency-only change may touch. Anything
 * else — `scripts`, lifecycle hooks, `packageManager`, the rest of `pnpm` —
 * runs or configures code in CI and is not a dependency bump.
 */
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export interface OptionalReviewInput {
  changedFiles: readonly string[];
  labels?: readonly string[];
  additions?: number;
  deletions?: number;
  fileListUnusable?: boolean;
  /** Files the diff ADDS. Absent means unknown: no test path qualifies. */
  addedFiles?: readonly string[];
  /**
   * True only when every changed package.json was compared at base and head
   * and differs in dependency fields alone. Absent means unverified.
   */
  dependencyManifestsVerified?: boolean;
}

export function isPackageManifest(file: string): boolean {
  return file.endsWith('package.json');
}

export function isDependencyFileSet(files: readonly string[]): boolean {
  return files.length > 0 && files.every(file => DEPENDENCY_ONLY_PATTERNS.some(p => p.test(file)));
}

export function hasDependenciesLabel(labels: readonly string[] | undefined): boolean {
  return labels?.some(label => label.toLowerCase() === 'dependencies') ?? false;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutDependencyFields(raw: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const rest: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  for (const field of DEPENDENCY_FIELDS) delete rest[field];
  // `pnpm.overrides` pins transitive versions — dependency data. Every other
  // `pnpm` key (onlyBuiltDependencies, patchedDependencies, ...) must match.
  const pnpm = rest.pnpm;
  if (pnpm && typeof pnpm === 'object' && !Array.isArray(pnpm)) {
    const pnpmRest: Record<string, unknown> = { ...(pnpm as Record<string, unknown>) };
    delete pnpmRest.overrides;
    if (Object.keys(pnpmRest).length === 0) delete rest.pnpm;
    else rest.pnpm = pnpmRest;
  }
  return canonical(rest);
}

/** True when two package.json texts differ in dependency fields alone. */
export function manifestChangeIsDependencyOnly(before: string, after: string): boolean {
  const a = withoutDependencyFields(before);
  const b = withoutDependencyFields(after);
  return a !== undefined && a === b;
}

/**
 * Low-risk changes may skip mandatory review while their ordinary CI checks
 * remain required. Dependency-only skips require the existing `dependencies`
 * label AND verified manifests; small app fixes are capped at three
 * app-source files and 100 changed lines, and may only ADD tests. Guardrail,
 * migration, and incomplete-file-list cases never qualify.
 */
export function optionalReviewReason(input: OptionalReviewInput): string | undefined {
  const { changedFiles } = input;
  if (changedFiles.length === 0 || input.fileListUnusable) return undefined;

  if (requiredTier(changedFiles).tier === 'none') return 'documentation';

  if (isDependencyFileSet(changedFiles)) {
    return hasDependenciesLabel(input.labels) && input.dependencyManifestsVerified === true
      ? 'dependency-only'
      : undefined;
  }

  if (
    requiredTier(changedFiles).tier === 'independent' ||
    touchesMigration(changedFiles) ||
    changedFiles.length > SMALL_APP_FILE_LIMIT ||
    !changedFiles.every(file => APP_SOURCE_PATTERN.test(file))
  ) {
    return undefined;
  }

  const added = new Set(input.addedFiles ?? []);
  if (changedFiles.some(file => TEST_SUPPORT_PATTERN.test(file) && !added.has(file))) {
    return undefined;
  }

  if (input.additions === undefined || input.deletions === undefined) return undefined;
  const changedLines = input.additions + input.deletions;
  if (
    !Number.isFinite(changedLines) ||
    changedLines < 0 ||
    changedLines > SMALL_APP_CHANGED_LINE_LIMIT
  ) {
    return undefined;
  }
  return 'small-app-change';
}

function floorFor(file: string): { tier: Tier; reason: string } {
  if (INDEPENDENT_PATTERNS.some(p => p.test(file))) {
    return { tier: 'independent', reason: `${file} is a guardrail or high-risk path` };
  }
  if (MIGRATION_PATTERN.test(file)) {
    return {
      tier: 'adversarial',
      reason: `${file} is a migration — one lens must be ${MIGRATION_LENS}, and src/test/database/ must be green`,
    };
  }
  if (NONE_PATTERNS.some(p => p.test(file))) {
    return { tier: 'none', reason: `${file} is documentation` };
  }
  // Everything else, INCLUDING unrecognised paths: fail safe, not fail cheap.
  return { tier: 'adversarial', reason: `${file} is application or tooling code` };
}

export function requiredTier(files: readonly string[]): { tier: Tier; reason: string } {
  if (files.length === 0) return { tier: 'adversarial', reason: 'no files' };
  // Seed from the first file's own candidate so `reason` always names a real
  // path for a non-empty list, even when every file resolves to 'none'.
  let best = floorFor(files[0]!);
  for (const file of files.slice(1)) {
    const candidate = floorFor(file);
    if (TIER_ORDER.indexOf(candidate.tier) > TIER_ORDER.indexOf(best.tier)) best = candidate;
  }
  return best;
}

export function meetsFloor(supplied: Tier, floor: Tier): boolean {
  return TIER_ORDER.indexOf(supplied) >= TIER_ORDER.indexOf(floor);
}

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Files changed against a base ref, for the CLI. */
export function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function changedLineCounts(base: string): { additions: number; deletions: number } {
  const out = execFileSync('git', ['diff', '--numstat', `${base}...HEAD`], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .reduce(
      (counts, line) => {
        const [added, deleted] = line.split('\t');
        // Binary changes report `-`; they cannot qualify for the bounded app route.
        if (added === '-' || deleted === '-') {
          return { additions: Number.NaN, deletions: Number.NaN };
        }
        return {
          additions: counts.additions + Number(added),
          deletions: counts.deletions + Number(deleted),
        };
      },
      { additions: 0, deletions: 0 }
    );
}

function addedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`], {
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

/** Same rule the gate applies, read from git instead of the GitHub API. */
function manifestsVerified(base: string, files: readonly string[]): boolean {
  try {
    const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const show = (ref: string, file: string) =>
      execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', stdio: 'pipe' });
    return files
      .filter(isPackageManifest)
      .every(file => manifestChangeIsDependencyOnly(show(mergeBase, file), show('HEAD', file)));
  } catch {
    // An added or deleted manifest has no counterpart to compare: not a bump.
    return false;
  }
}

function labelArgs(argv: readonly string[]): string[] {
  return argv.flatMap((arg, i) => (arg === '--label' ? [argv[i + 1] ?? ''] : []));
}

/**
 * `--files-stdin`: read a newline-separated file list on stdin and print ONLY
 * the tier. `scripts/qa/post-review-gate.sh` uses it to check an `owner`
 * override's claimed floor against the real one BEFORE posting — the same
 * check `evaluateReviewGate` applies afterwards. One table, two callers; a
 * copied rule in shell would drift (fallback review of #2243, S-c).
 */
function runFilesStdin(): void {
  const raw = readFileSync(0, 'utf8');
  const files = raw.split('\n').filter(Boolean);
  // An empty list is not "no risk": it is "we could not tell". Match
  // review-gate.ts's resolveFloor, which pins an empty list to independent.
  console.log(files.length === 0 ? 'independent' : requiredTier(files).tier);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--files-stdin')) {
    runFilesStdin();
    process.exit(0);
  }
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex === -1 ? 'origin/main' : (process.argv[baseIndex + 1] ?? 'origin/main');
  const files = changedFiles(base);
  const { tier, reason } = requiredTier(files);
  const labels = labelArgs(process.argv);
  const optional = optionalReviewReason({
    changedFiles: files,
    labels,
    ...changedLineCounts(base),
    addedFiles: addedFiles(base),
    dependencyManifestsVerified:
      isDependencyFileSet(files) && hasDependenciesLabel(labels)
        ? manifestsVerified(base, files)
        : undefined,
  });
  console.log(`review-tier: ${files.length} file(s) vs ${base}`);
  console.log(`tier: ${tier}`);
  console.log(`reason: ${reason}`);
  console.log(optional ? `review: optional (${optional})` : 'review: required');
}
