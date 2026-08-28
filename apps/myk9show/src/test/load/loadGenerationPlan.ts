import type { LoadSessionAssignment } from './loadAssignments';
import { WRITER_WORKLOAD_KINDS, type LoadWorkloadKind } from './loadScenario';

/**
 * Which sessions a real browser drives and which an API-level virtual user drives.
 *
 * Every writer stays on a browser: OCC, the replication queue, the offline store
 * and the mutation upload path are exactly what a write workload has to exercise,
 * and a virtual user bypasses all three. Readers move to virtual users because
 * 270 Chromium contexts do not fit on sixteen free runners — all-browser
 * generation needs 22.4 contexts per runner against today's 6-7.
 *
 * A sample of readers stays on real browsers regardless. A virtual reader issues
 * the same requests but never paints, so it cannot catch a client-side rendering
 * regression; without the sample, a passing run would claim coverage it does not
 * have.
 */

/** Reader kinds. Everything else either writes or is a distinct low-count surface. */
const READER_WORKLOAD_KINDS: readonly LoadWorkloadKind[] = ['exhibitor-read', 'run-order-read'];

export interface LoadGenerationPlan {
  /** Sessions driven by a real browser context. */
  readonly browser: readonly LoadSessionAssignment[];
  /** Sessions driven by an API-level virtual user. */
  readonly virtualUser: readonly LoadSessionAssignment[];
}

export interface LoadGenerationPlanOptions {
  /**
   * Readers kept on a real browser. One per runner preserves rendering evidence
   * on every shard rather than concentrating it on one.
   */
  readonly browserReaderSample: number;
}

export function isReaderWorkload(kind: LoadWorkloadKind): boolean {
  return READER_WORKLOAD_KINDS.includes(kind);
}

export function planGeneration(
  assignments: readonly LoadSessionAssignment[],
  options: LoadGenerationPlanOptions
): LoadGenerationPlan {
  if (!Number.isInteger(options.browserReaderSample) || options.browserReaderSample < 0) {
    throw new Error(
      `browserReaderSample must be a non-negative integer; received ${options.browserReaderSample}.`
    );
  }

  const browser: LoadSessionAssignment[] = [];
  const virtualUser: LoadSessionAssignment[] = [];
  let sampledReaders = 0;

  for (const assignment of assignments) {
    if (WRITER_WORKLOAD_KINDS.includes(assignment.kind)) {
      browser.push(assignment);
      continue;
    }
    if (!isReaderWorkload(assignment.kind)) {
      // Operations sessions are a distinct surface at low count; keep them real.
      browser.push(assignment);
      continue;
    }
    if (sampledReaders < options.browserReaderSample) {
      sampledReaders += 1;
      browser.push(assignment);
      continue;
    }
    virtualUser.push(assignment);
  }

  return { browser, virtualUser };
}

/** Counts for the evidence split, so a reader knows which sessions proved what. */
export function describeGenerationPlan(plan: LoadGenerationPlan): {
  browserSessions: number;
  virtualUserSessions: number;
} {
  return {
    browserSessions: plan.browser.length,
    virtualUserSessions: plan.virtualUser.length,
  };
}
