/**
 * MYK9-737: "Results Posted" pushes that are not getting through.
 *
 * Each class queues one row in private.class_results_push; push-trigger-scoring
 * marks it sent after it has sent, and the class-results-push-retry cron
 * re-posts it every five minutes until then, up to five attempts. This check
 * reads `public.class_results_push_health()` (called by cron-health-check on
 * every run) and fails when any class has run out of attempts ('failed') or is
 * still pending after three, naming the classes, because exhibitors of those
 * classes have not been told their results are up.
 *
 * Deno-free and side-effect free, like its `systemHealthChecks.ts` siblings.
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

export const CLASS_RESULTS_PUSH_KEY = 'class_results_push';
const LABEL = 'Results Posted pushes';

interface StuckClass {
  className: string;
  showName: string | null;
  status: string;
  attempts: number | null;
  lastError: string | null;
}

function parseStuck(raw: unknown): StuckClass | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const className =
    typeof row.class_name === 'string' && row.class_name !== ''
      ? row.class_name
      : typeof row.class_id === 'string'
        ? `class ${row.class_id}`
        : null;
  if (!className || typeof row.status !== 'string') return null;
  return {
    className,
    showName: typeof row.show_name === 'string' ? row.show_name : null,
    status: row.status,
    attempts: typeof row.attempts === 'number' ? row.attempts : null,
    lastError: typeof row.last_error === 'string' ? row.last_error : null,
  };
}

function describe(stuck: StuckClass): string {
  const where = stuck.showName ? `${stuck.className} (${stuck.showName})` : stuck.className;
  const attempts = stuck.attempts === null ? '' : `, ${stuck.attempts} attempts`;
  const error = stuck.lastError ? `: ${stuck.lastError}` : '';
  return `${where} ${stuck.status}${attempts}${error}`;
}

/**
 * `raw` is what `class_results_push_health()` returned —
 * `{ stuck, failed, pending, sample[] }` — or `{ error }` when the RPC failed,
 * or undefined when the runner did not ask (a function older than the
 * migration).
 */
export function classResultsPushCheck(raw: unknown, checkedAt: string): SnapshotCheck {
  const base = { key: CLASS_RESULTS_PUSH_KEY, label: LABEL, checked_at: checkedAt };

  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      status: 'warn',
      detail: 'class_results_push_health was not reported',
      verification: 'unprovable',
    };
  }

  const facts = raw as Record<string, unknown>;
  if (typeof facts.error === 'string') {
    return {
      ...base,
      status: 'warn',
      detail: `class_results_push_health failed: ${facts.error}`,
      verification: 'unprovable',
    };
  }

  const stuck = facts.stuck;
  if (typeof stuck !== 'number' || !Number.isFinite(stuck)) {
    return {
      ...base,
      status: 'warn',
      detail: 'class_results_push_health returned an unreadable count',
      verification: 'unprovable',
    };
  }

  const pending = typeof facts.pending === 'number' ? facts.pending : null;
  if (stuck === 0) {
    const inFlight = pending ? ` (${pending} pending, retrying)` : '';
    return {
      ...base,
      status: 'ok',
      detail: `every Results Posted push was sent or is on an early attempt${inFlight}`,
      delta_value: 0,
    };
  }

  const sample = Array.isArray(facts.sample)
    ? facts.sample.map(parseStuck).filter((row): row is StuckClass => row !== null)
    : [];
  const named = sample.map(describe).join('; ');
  const more = stuck > sample.length ? `; and ${stuck - sample.length} more` : '';
  return {
    ...base,
    status: 'fail',
    detail:
      `${stuck} ${stuck === 1 ? 'class has' : 'classes have'} not had their Results Posted push delivered` +
      (named ? `: ${named}${more}` : ''),
    delta_value: stuck,
  };
}
