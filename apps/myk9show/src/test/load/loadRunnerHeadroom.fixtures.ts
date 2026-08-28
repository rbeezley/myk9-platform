import { EXPECTED_ACCOUNT_REPOS, evaluateHeadroom, type HeadroomInputs } from './loadRunnerHeadroom';

/**
 * Shared fixtures for the headroom gate's two test files.
 *
 * Split out because the suites are cohesive but the combined file passed the
 * repository's 500-line ceiling. `evaluateHeadroom` (the decision) and
 * `collectAccountJobCounts` (the reads) are tested separately; both need the
 * same defaults, and the collection suite feeds its results straight into
 * `headroom()` to assert the pair refuses together.
 */

export const CEILING = 20;
export const REQUIRED = 17;
export const CURRENT = 'rbeezley/myk9-platform';
export const SIBLING = 'rbeezley/myK9Qv3';

/** Every expected repo present, so scope checks pass and the arithmetic is under test. */
export function fullInventory(extra: readonly string[] = []): string[] {
  return [...EXPECTED_ACCOUNT_REPOS, ...extra];
}

export function headroom(overrides: Partial<HeadroomInputs> = {}) {
  return evaluateHeadroom({
    ceiling: CEILING,
    required: REQUIRED,
    currentRepo: CURRENT,
    repos: [{ fullName: CURRENT, activeJobs: 0 }],
    inventory: fullInventory(),
    unreadableRepos: [],
    ...overrides,
  });
}

export function verdictReason(verdict: ReturnType<typeof evaluateHeadroom>): string {
  return verdict.ok ? '' : verdict.reason;
}
