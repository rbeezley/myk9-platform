/**
 * GitHub reads that feed the optional-review route in review-tier.ts. Kept
 * apart from review-gate.ts so the gate's runCli only threads two fields.
 *
 * Every helper fails CLOSED: an API error, a missing file, or an unparseable
 * manifest means "not proven low-risk", and the gate falls back to requiring
 * review. Nothing here executes PR code — it reads file contents as data,
 * which is safe under `pull_request_target`.
 */
import {
  hasDependenciesLabel,
  isDependencyFileSet,
  isPackageManifest,
  manifestChangeIsDependencyOnly,
} from './review-tier.ts';

export type GhRead = (args: string[]) => string;

function lines(out: string): string[] {
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Files the PR ADDS. On the bounded app route a test path qualifies only
 * when added, so an unknown list must read as "nothing added".
 */
export function fetchAddedFiles(run: GhRead, repo: string, prNumber: string): string[] {
  try {
    return lines(
      run([
        'api',
        '--paginate',
        '--jq',
        '.[] | select(.status == "added") | .filename',
        `repos/${repo}/pulls/${prNumber}/files?per_page=100`,
      ])
    );
  } catch {
    return [];
  }
}

/**
 * Compare every changed package.json at the merge base and at head. Only
 * called for a labeled dependency-shaped file set; `undefined` otherwise so
 * the evaluator can tell "not applicable" from "checked and refused".
 */
export function verifyDependencyManifests(
  run: GhRead,
  repo: string,
  input: {
    changedFiles: readonly string[];
    labels: readonly string[];
    baseSha?: string;
    headSha: string;
  }
): boolean | undefined {
  if (!isDependencyFileSet(input.changedFiles) || !hasDependenciesLabel(input.labels)) {
    return undefined;
  }
  if (!input.baseSha) return false;
  try {
    // GitHub diffs a PR against the merge base, not the base tip; a manifest
    // main changed since the branch point would otherwise read as this PR's.
    const mergeBase = run([
      'api',
      '--jq',
      '.merge_base_commit.sha',
      `repos/${repo}/compare/${input.baseSha}...${input.headSha}`,
    ]).trim();
    if (!mergeBase) return false;
    const read = (file: string, ref: string) =>
      run([
        'api',
        '-H',
        'Accept: application/vnd.github.raw+json',
        `repos/${repo}/contents/${file}?ref=${ref}`,
      ]);
    return input.changedFiles
      .filter(isPackageManifest)
      .every(file =>
        manifestChangeIsDependencyOnly(read(file, mergeBase), read(file, input.headSha))
      );
  } catch {
    // An added or deleted manifest 404s on one side: not a dependency bump.
    return false;
  }
}
