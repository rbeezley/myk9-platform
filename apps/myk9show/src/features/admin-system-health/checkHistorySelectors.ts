/**
 * Derivations for the redesigned System Health board: per-check run history,
 * the counts every badge and tab reads, and the plain-language verdict.
 *
 * INTENT: everything here is DERIVED from one array of snapshots and nothing is
 * stored twice. The redesign exists because the production dashboard showed 12,
 * 10 and 3 for the same queue — three counts, three sources, all sincere. A
 * badge that can disagree with the list it labels is the bug, so the row status,
 * the strip, the tab counts and the verdict chips must all come from here.
 *
 * Side-effect free and `now`-injected, like systemHealthSelectors.
 */
import type {
  CheckStatus,
  HealthCheck,
  SystemHealthSnapshot,
  CheckVerification,
} from './systemHealthTypes';

/** How many runs the history strip draws. */
export const HISTORY_STRIP_LENGTH = 12;

/** One run of one check, as drawn by a single bar in the strip. */
export interface CheckRun {
  status: CheckStatus;
  at: string;
}

/** A check plus everything the expanded row and the strip need. */
export interface CheckWithHistory extends HealthCheck {
  /**
   * Up to `HISTORY_STRIP_LENGTH` runs, OLDEST FIRST — the order the strip draws
   * left to right. Reversed here, at the boundary, precisely so no component has
   * to know which way the query sorted.
   */
  history: CheckRun[];
  /** Most recent `ok` run, or null if this check has never passed in-window. */
  lastPassedAt: string | null;
}

/** The three buckets the verdict chips and filter tabs count. */
export interface CheckSummary {
  failing: number;
  /** Amber: cannot-prove plus proven-degraded. One bucket, two words. */
  unverified: number;
  passing: number;
  total: number;
}

export type CheckFilter = 'all' | 'fail' | 'warn' | 'ok';

/**
 * The word shown on a row's badge.
 *
 * "Unverified" is not a softer "Fail" — it means the check cannot prove anything
 * either way. Applying it to a check that *did* prove a degradation would be a
 * lie, which is why amber splits on `verification` rather than all reading the
 * design's single amber word.
 */
export function statusLabel(status: CheckStatus, verification: CheckVerification): string {
  switch (status) {
    case 'ok':
      return 'OK';
    case 'fail':
      return 'Fail';
    case 'warn':
      return verification === 'unprovable' ? 'Unverified' : 'Needs a look';
    default:
      return 'Unknown';
  }
}

/** Newest-first snapshots in, per-check history out. */
export function buildCheckHistories(
  snapshots: SystemHealthSnapshot[],
  limit: number = HISTORY_STRIP_LENGTH
): CheckWithHistory[] {
  const latest = snapshots[0];
  if (!latest) return [];

  // Oldest first, capped — the strip's drawing order.
  const window = snapshots.slice(0, limit).reverse();

  return latest.checks.map(check => {
    const history: CheckRun[] = [];
    for (const snapshot of window) {
      const match = snapshot.checks.find(c => c.key === check.key);
      // A check absent from an older snapshot simply has no bar for that run —
      // do not invent an `unknown` bar, which would read as a failed run.
      if (match) history.push({ status: match.status, at: snapshot.createdAt });
    }

    let lastPassedAt: string | null = null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].status === 'ok') {
        lastPassedAt = history[i].at;
        break;
      }
    }

    return { ...check, history, lastPassedAt };
  });
}

/** Counts for the verdict chips and the filter tabs. One source, four readers. */
export function summarizeChecks(checks: Pick<HealthCheck, 'status'>[]): CheckSummary {
  const summary: CheckSummary = { failing: 0, unverified: 0, passing: 0, total: checks.length };
  for (const check of checks) {
    if (check.status === 'fail') summary.failing += 1;
    else if (check.status === 'ok') summary.passing += 1;
    // `unknown` is a malformed writer, not a pass. It sits in amber with the
    // rest of "something here is not right" rather than quietly counting green.
    else summary.unverified += 1;
  }
  return summary;
}

/** Apply a filter tab. `warn` is the amber bucket, so it catches `unknown` too. */
export function filterChecks<T extends Pick<HealthCheck, 'status'>>(
  checks: T[],
  filter: CheckFilter
): T[] {
  if (filter === 'all') return checks;
  if (filter === 'fail') return checks.filter(c => c.status === 'fail');
  if (filter === 'ok') return checks.filter(c => c.status === 'ok');
  return checks.filter(c => c.status !== 'fail' && c.status !== 'ok');
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * The verdict band's headline. Leads with the answer in plain language, because
 * the page's whole job is to save the admin from working it out from a list.
 */
export function verdictHeadline(summary: CheckSummary, isStale: boolean, isEmpty: boolean): string {
  if (isEmpty) return 'No health run has ever been recorded';
  if (isStale) return 'These results are too old to answer “is it broken now?”';
  // A fresh run that recorded ZERO checks is not health, it is silence. The
  // snapshot table's CHECK allows an empty array, and deriveEffectiveStatus only
  // treats a MISSING snapshot as empty — so without this branch the page would
  // say "Everything's running" directly above "No checks have been recorded".
  if (summary.total === 0) return 'The last run recorded no checks at all';
  if (summary.failing === 1) return 'One check is failing';
  if (summary.failing > 1) return `${count(summary.failing)} checks are failing`;
  if (summary.unverified > 0) return 'Nothing is failing, but not everything is proven';
  return "Everything's running";
}

/** The sentence under the headline — states the connection, not just the count. */
export function verdictExplanation(summary: CheckSummary, isStale: boolean, isEmpty: boolean) {
  if (isEmpty) {
    return 'The nightly runner has never written a snapshot. Until it does, this page cannot tell you anything about the platform.';
  }
  if (isStale) {
    return 'The last run is older than the window it covers, so a failure since then would not appear here. Re-run the checks before trusting anything below.';
  }
  if (summary.total === 0) {
    return 'The runner wrote a snapshot but it contained no checks — the run completed without evaluating anything, which tells you nothing about the platform.';
  }
  if (summary.failing > 0) {
    const rest =
      summary.unverified > 0
        ? ` ${count(summary.unverified)} more cannot prove either way.`
        : ' Everything else passed.';
    return `Start with the failing checks below — each one carries what it saw and what to do about it.${rest}`;
  }
  if (summary.unverified > 0) {
    return `${count(summary.unverified)} of ${summary.total} checks cannot confirm success — see Coverage for what that leaves unwatched.`;
  }
  return `All ${summary.total} checks passed on the last run.`;
}
