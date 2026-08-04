import { describe, it, expect } from 'vitest';
import {
  buildCheckHistories,
  filterChecks,
  statusLabel,
  summarizeChecks,
  verdictExplanation,
  verdictHeadline,
  HISTORY_STRIP_LENGTH,
} from './checkHistorySelectors';
import type { CheckStatus, HealthCheck, SystemHealthSnapshot } from './systemHealthTypes';

const check = (over: Partial<HealthCheck> = {}): HealthCheck => ({
  key: 'payout_cron',
  label: 'Nightly payout job',
  status: 'ok',
  detail: '',
  checkedAt: null,
  verification: 'proven',
  ...over,
});

/** Snapshots are supplied newest-first, matching useSystemHealthSnapshots. */
const snapshot = (day: number, checks: HealthCheck[]): SystemHealthSnapshot => ({
  id: `snap-${day}`,
  createdAt: `2026-07-${String(day).padStart(2, '0')}T07:00:00.000Z`,
  source: 'cron-health-check',
  overallStatus: 'ok',
  checks,
  runDurationMs: 1200,
});

describe('buildCheckHistories', () => {
  it('returns history oldest first, so the strip can draw left to right', () => {
    const [row] = buildCheckHistories([
      snapshot(3, [check({ status: 'fail' })]),
      snapshot(2, [check({ status: 'warn' })]),
      snapshot(1, [check({ status: 'ok' })]),
    ]);

    expect(row.history.map(r => r.status)).toEqual(['ok', 'warn', 'fail']);
    expect(row.history.at(-1)?.at).toContain('2026-07-03');
  });

  it('derives lastPassedAt from the newest ok run, never stores it', () => {
    const [row] = buildCheckHistories([
      snapshot(4, [check({ status: 'fail' })]),
      snapshot(3, [check({ status: 'fail' })]),
      snapshot(2, [check({ status: 'ok' })]),
      snapshot(1, [check({ status: 'ok' })]),
    ]);

    expect(row.lastPassedAt).toBe('2026-07-02T07:00:00.000Z');
  });

  it('lastPassedAt is null when the check has never passed in the window', () => {
    const [row] = buildCheckHistories([
      snapshot(2, [check({ status: 'fail' })]),
      snapshot(1, [check({ status: 'warn' })]),
    ]);
    expect(row.lastPassedAt).toBeNull();
  });

  it('the newest run and the row status cannot disagree', () => {
    const [row] = buildCheckHistories([
      snapshot(2, [check({ status: 'warn' })]),
      snapshot(1, [check({ status: 'ok' })]),
    ]);
    expect(row.history.at(-1)?.status).toBe(row.status);
  });

  it('moves an old passing row into failing when its own window expires', () => {
    const latest = snapshot(4, [
      check({
        checkedAt: '2026-07-04T07:00:00.000Z',
        staleAfterMs: 60 * 60 * 1000,
      }),
    ]);

    const [row] = buildCheckHistories(
      [latest],
      HISTORY_STRIP_LENGTH,
      Date.parse('2026-07-04T09:01:00.000Z')
    );

    expect(row.status).toBe('fail');
    expect(row.history[0]?.status).toBe('fail');
  });

  it('omits a bar for a run that predates the check, rather than inventing one', () => {
    // anon_grants did not exist on day 1 — it must not render as a failed run.
    const [row] = buildCheckHistories([
      snapshot(2, [check({ key: 'anon_grants', status: 'ok' })]),
      snapshot(1, [check({ key: 'payout_cron', status: 'ok' })]),
    ]);
    expect(row.history).toHaveLength(1);
  });

  it('caps the window and takes the NEWEST runs', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      snapshot(20 - i, [check({ status: i === 0 ? 'fail' : 'ok' })])
    );
    const [row] = buildCheckHistories(many);
    expect(row.history).toHaveLength(HISTORY_STRIP_LENGTH);
    expect(row.history.at(-1)?.status).toBe('fail');
  });

  it('is empty for no snapshots, and does not throw', () => {
    expect(buildCheckHistories([])).toEqual([]);
  });

  it('takes the row set from the newest snapshot, not the union of all', () => {
    const rows = buildCheckHistories([
      snapshot(2, [check({ key: 'a' })]),
      snapshot(1, [check({ key: 'a' }), check({ key: 'retired' })]),
    ]);
    expect(rows.map(r => r.key)).toEqual(['a']);
  });
});

describe('summarizeChecks', () => {
  it('splits into failing / amber / passing', () => {
    expect(
      summarizeChecks([{ status: 'fail' }, { status: 'warn' }, { status: 'ok' }, { status: 'ok' }])
    ).toEqual({ failing: 1, unverified: 1, passing: 2, total: 4 });
  });

  it('counts an unknown status as amber, never as passing', () => {
    const s = summarizeChecks([{ status: 'unknown' as CheckStatus }]);
    expect(s.unverified).toBe(1);
    expect(s.passing).toBe(0);
  });

  it('an empty set is all zeroes', () => {
    expect(summarizeChecks([])).toEqual({ failing: 0, unverified: 0, passing: 0, total: 0 });
  });
});

describe('filterChecks', () => {
  const checks = [
    check({ key: 'f', status: 'fail' }),
    check({ key: 'w', status: 'warn' }),
    check({ key: 'u', status: 'unknown' }),
    check({ key: 'o', status: 'ok' }),
  ];

  it('the amber tab catches unknown as well as warn', () => {
    expect(filterChecks(checks, 'warn').map(c => c.key)).toEqual(['w', 'u']);
  });

  it('tab counts equal the rows each tab shows', () => {
    const s = summarizeChecks(checks);
    expect(filterChecks(checks, 'fail')).toHaveLength(s.failing);
    expect(filterChecks(checks, 'warn')).toHaveLength(s.unverified);
    expect(filterChecks(checks, 'ok')).toHaveLength(s.passing);
    expect(filterChecks(checks, 'all')).toHaveLength(s.total);
  });
});

describe('statusLabel', () => {
  it('only says Unverified when the check genuinely cannot prove', () => {
    expect(statusLabel('warn', 'unprovable')).toBe('Unverified');
    expect(statusLabel('warn', 'proven')).toBe('Needs a look');
  });

  it('passes and failures are unambiguous', () => {
    expect(statusLabel('ok', 'proven')).toBe('OK');
    expect(statusLabel('fail', 'proven')).toBe('Fail');
  });
});

describe('verdict', () => {
  const s = (over: Partial<ReturnType<typeof summarizeChecks>> = {}) => ({
    failing: 0,
    unverified: 0,
    passing: 6,
    total: 6,
    ...over,
  });

  it('leads with the answer, in words', () => {
    expect(verdictHeadline(s({ failing: 1 }), false, false)).toBe('One check is failing');
    expect(verdictHeadline(s({ failing: 2 }), false, false)).toBe('Two checks are failing');
    expect(verdictHeadline(s(), false, false)).toBe("Everything's running");
  });

  it('does not claim everything is running when something is unproven', () => {
    expect(verdictHeadline(s({ unverified: 1, passing: 5 }), false, false)).toBe(
      'Nothing is failing, but not everything is proven'
    );
  });

  it('staleness outranks the counts — the page cannot answer "now"', () => {
    expect(verdictHeadline(s({ failing: 3 }), true, false)).toContain('too old');
    expect(verdictExplanation(s(), true, false)).toContain('would not appear here');
  });

  // Codex review of PR #1557: the snapshot CHECK allows an empty checks array,
  // and deriveEffectiveStatus only calls a MISSING snapshot empty. A fresh run
  // that evaluated nothing must not read as a clean bill of health.
  it('a fresh run that recorded zero checks is silence, not health', () => {
    const none = s({ passing: 0, total: 0 });
    expect(verdictHeadline(none, false, false)).toBe('The last run recorded no checks at all');
    expect(verdictExplanation(none, false, false)).toContain('without evaluating anything');
    expect(verdictHeadline(none, false, false)).not.toContain("Everything's running");
  });

  it('an empty board says so rather than reading as healthy', () => {
    expect(verdictHeadline(s({ passing: 0, total: 0 }), false, true)).toContain(
      'ever been recorded'
    );
    expect(verdictExplanation(s({ passing: 0, total: 0 }), false, true)).toContain('never written');
  });

  it('the explanation mentions the unproven remainder alongside failures', () => {
    expect(
      verdictExplanation(s({ failing: 1, unverified: 2, passing: 3 }), false, false)
    ).toContain('Two more cannot prove either way');
  });
});
