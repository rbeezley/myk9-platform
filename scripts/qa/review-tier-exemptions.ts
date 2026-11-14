/**
 * The one narrow exemption from the guardrail (`independent`) floor, decided
 * from file CONTENTS at two commits, never from the file name (MYK9-1932). An
 * exempt file still falls to its ordinary floor (`adversarial`: tooling code),
 * so it is never treated as docs.
 *
 * Only an allowlisted ratchet baseline whose change lowers counts or removes
 * entries qualifies. A comment-only exemption was considered and rejected: a
 * line-based check is bypassable (block-comment wrapping, code after a closing comment marker,
 * template literals, heredocs), and a per-language tokenizer is too much
 * attack surface for a security gate.
 *
 * Fail closed: any fetch or parse error, and any added or deleted file (it has
 * no counterpart on one side), is NOT exempt. Shared by the gate (contents by
 * SHA through the GitHub API; `pull_request_target` never checks out the PR
 * head), `qa:review-tier` and `--files-stdin` (contents through git), so the
 * floor an override claims equals the floor the gate computes.
 */
import { execFileSync } from 'node:child_process';

/**
 * Baselines under scripts/qa/ whose every number is a ratchet cap (lower is
 * better). A new baseline file is never exempt until added here.
 * Excluded: `typecheck-scripts.baseline.json` (a JSON array of error strings,
 * not counts).
 */
export const RATCHET_BASELINE_ALLOWLIST: ReadonlySet<string> = new Set([
  'scripts/qa/code-quality-ratchet.baseline.json',
  'scripts/qa/em-dash-ratchet.baseline.json',
]);

/**
 * Per baseline, the maps whose entries may be REMOVED. Removal is lowering only
 * where the ratchet reads a missing entry as zero: em-dash-ratchet.ts reads
 * `baseline[file] ?? 0`. code-quality-ratchet.ts iterates the baseline's own
 * metric keys, so deleting a metric switches its check off: never removable.
 */
const REMOVABLE_ENTRY_MAPS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  // `total` is a retired key (MYK9-1972): the ratchet computes the total at
  // check time and reads nothing else from the baseline, so dropping it is safe.
  ['scripts/qa/em-dash-ratchet.baseline.json', new Set(['files', 'total'])],
]);

/** Keys whose value is never a ratchet count: pure bookkeeping or schema. */
const IGNORED_KEYS = new Set(['updatedAt']);
const MUST_MATCH_TOP_LEVEL_KEYS = new Set(['version']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoweringOnly(
  base: unknown,
  head: unknown,
  path: string,
  removableMaps: ReadonlySet<string>
): boolean {
  const topLevel = path === '';
  if (typeof base === 'number' && typeof head === 'number') return head <= base;
  if (isRecord(base) && isRecord(head)) {
    // A removed entry is lowering only inside a map the ratchet reads as zero
    // when missing; anywhere else it can switch a check off.
    const childOf = (key: string) => (topLevel ? key : `${path}.${key}`);
    const removable = (key: string) =>
      removableMaps.has(path) || IGNORED_KEYS.has(key) || removableMaps.has(childOf(key));
    if (Object.keys(base).some(key => !(key in head) && !removable(key))) return false;
    for (const [key, headValue] of Object.entries(head)) {
      if (IGNORED_KEYS.has(key)) continue;
      // A key base lacks is an added entry: never an exemption.
      if (!(key in base)) return false;
      if (topLevel && MUST_MATCH_TOP_LEVEL_KEYS.has(key)) {
        if (JSON.stringify(base[key]) !== JSON.stringify(headValue)) return false;
        continue;
      }
      if (!isLoweringOnly(base[key], headValue, childOf(key), removableMaps)) return false;
    }
    return true;
  }
  // Strings, booleans, arrays, null and type changes must be identical.
  return JSON.stringify(base) === JSON.stringify(head);
}

/**
 * True when `head` differs from `base` only by lower counts, or by entries
 * removed from one of `removableMaps` (dotted paths; none by default).
 */
export function baselineChangeIsLoweringOnly(
  baseText: string,
  headText: string,
  removableMaps: ReadonlySet<string> = new Set()
): boolean {
  let base: unknown;
  let head: unknown;
  try {
    base = JSON.parse(baseText);
    head = JSON.parse(headText);
  } catch {
    return false;
  }
  if (!isRecord(base) || !isRecord(head)) return false;
  return isLoweringOnly(base, head, '', removableMaps);
}

/** Reads one file at the merge base and at head; throws when either is absent. */
export type BaselineReader = (file: string) => { base: string; head: string };

/**
 * The subset of `files` that are allowlisted baselines whose change is
 * lowering-only. Any reader error leaves that file out (fail closed).
 */
export function exemptBaselineFiles(files: readonly string[], read: BaselineReader): Set<string> {
  const exempt = new Set<string>();
  for (const file of files) {
    if (!RATCHET_BASELINE_ALLOWLIST.has(file)) continue;
    try {
      const { base, head } = read(file);
      if (baselineChangeIsLoweringOnly(base, head, REMOVABLE_ENTRY_MAPS.get(file)))
        exempt.add(file);
    } catch {
      // An added or deleted file 404s on one side: not exempt.
    }
  }
  return exempt;
}

const hasAllowlisted = (files: readonly string[]) =>
  files.some(file => RATCHET_BASELINE_ALLOWLIST.has(file));

/** `gh` runner shape shared with review-gate.ts and optional-review-inputs.ts. */
export type GhRunner = (args: string[]) => string;

/** Gate path: contents by SHA through the GitHub API, no working tree. */
export function exemptBaselineFilesViaGh(
  run: GhRunner,
  repo: string,
  input: { changedFiles: readonly string[]; baseSha?: string; headSha: string }
): Set<string> {
  if (!hasAllowlisted(input.changedFiles) || !input.baseSha) return new Set();
  let mergeBase: string;
  try {
    // GitHub diffs a PR against the merge base, not the base tip.
    mergeBase = run([
      'api',
      '--jq',
      '.merge_base_commit.sha',
      `repos/${repo}/compare/${input.baseSha}...${input.headSha}`,
    ]).trim();
  } catch {
    return new Set();
  }
  if (!mergeBase) return new Set();
  const at = (file: string, ref: string) =>
    run([
      'api',
      '-H',
      'Accept: application/vnd.github.raw+json',
      `repos/${repo}/contents/${file}?ref=${ref}`,
    ]);
  return exemptBaselineFiles(input.changedFiles, file => ({
    base: at(file, mergeBase),
    head: at(file, input.headSha),
  }));
}

/** Local path: contents through git, for `qa:review-tier` and `--files-stdin`. */
export function exemptBaselineFilesViaGit(
  base: string,
  head: string,
  files: readonly string[],
  cwd?: string
): Set<string> {
  if (!hasAllowlisted(files)) return new Set();
  const git = (args: string[]) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 16 * 1024 * 1024,
      ...(cwd ? { cwd } : {}),
    });
  let mergeBase: string;
  try {
    mergeBase = git(['merge-base', base, head]).trim();
  } catch {
    return new Set();
  }
  return exemptBaselineFiles(files, file => ({
    base: git(['show', `${mergeBase}:${file}`]),
    head: git(['show', `${head}:${file}`]),
  }));
}
