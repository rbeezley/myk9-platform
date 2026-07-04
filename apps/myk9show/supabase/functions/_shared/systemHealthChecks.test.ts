import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  worstOf,
  PAYOUT_CRON_JOB,
  STALE_AFTER_MS,
  type RawCronJob,
} from './systemHealthChecks';

// A fixed "now" so overdue/stale math is deterministic.
const NOW = Date.parse('2026-07-04T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const job = (over: Partial<RawCronJob> = {}): RawCronJob => ({
  jobname: 'some-job',
  active: true,
  last_status: 'succeeded',
  last_start: iso(2 * HOUR),
  last_end: iso(2 * HOUR),
  last_message: 'DO',
  ...over,
});

const facts = (over: Record<string, unknown> = {}) => ({
  probed_at: iso(0),
  latest_migration: '20260704140000',
  migration_count: 331,
  cron_jobs: [job({ jobname: PAYOUT_CRON_JOB })],
  ...over,
});

const find = (snap: ReturnType<typeof buildSnapshot>, key: string) =>
  snap.checks.find(c => c.key === key)!;

describe('worstOf', () => {
  it('empty set is ok', () => {
    expect(worstOf([])).toBe('ok');
  });

  it('fail dominates warn and ok', () => {
    expect(worstOf(['ok', 'warn', 'fail'])).toBe('fail');
    expect(worstOf(['ok', 'warn'])).toBe('warn');
    expect(worstOf(['ok', 'ok'])).toBe('ok');
  });
});

describe('buildSnapshot — contract shape', () => {
  it('emits source, worst-of overall_status, snake_case checks, and run_duration_ms', () => {
    const snap = buildSnapshot(facts(), { now: NOW, runDurationMs: 42 });

    expect(snap.source).toBe('cron-health-check');
    expect(snap.overall_status).toBe('ok');
    expect(snap.run_duration_ms).toBe(42);
    // one entry per check; snake_case checked_at populated (board parser reads it)
    expect(snap.checks.map(c => c.key)).toEqual(['payout_cron', 'background_jobs', 'migrations']);
    for (const c of snap.checks) {
      expect(typeof c.checked_at).toBe('string');
      expect(c).toHaveProperty('checked_at');
      expect(c).not.toHaveProperty('checkedAt');
    }
  });

  it('defaults source and run_duration_ms when omitted', () => {
    const snap = buildSnapshot(facts(), { now: NOW });
    expect(snap.source).toBe('cron-health-check');
    expect(snap.run_duration_ms).toBeNull();
  });
});

describe('payout_cron check (runbook 5.4)', () => {
  it('is ok when the payout job ran successfully within the window', () => {
    const snap = buildSnapshot(facts(), { now: NOW });
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain(PAYOUT_CRON_JOB);
    // checked_at reflects the job's last run, not the probe time
    expect(check.checked_at).toBe(iso(2 * HOUR));
  });

  it('fails and drives overall fail when the payout job is not scheduled', () => {
    const snap = buildSnapshot(facts({ cron_jobs: [] }), { now: NOW });
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('not scheduled');
    expect(snap.overall_status).toBe('fail');
  });

  it('fails when the payout job last run failed, surfacing the reason', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({
            jobname: PAYOUT_CRON_JOB,
            last_status: 'failed',
            last_message: 'ERROR:  Missing Vault secret: payout_cron_secret\nCONTEXT: ...',
          }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('Missing Vault secret');
    // multi-line pg message is trimmed to the first line
    expect(check.detail).not.toContain('CONTEXT');
    expect(snap.overall_status).toBe('fail');
  });

  it('warns when the payout job is overdue (last run older than the staleness window)', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({
            jobname: PAYOUT_CRON_JOB,
            last_start: iso(STALE_AFTER_MS + HOUR),
            last_end: iso(STALE_AFTER_MS + HOUR),
          }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('overdue');
    expect(snap.overall_status).toBe('warn');
  });

  it('fails when the payout job is inactive', () => {
    const snap = buildSnapshot(
      facts({ cron_jobs: [job({ jobname: PAYOUT_CRON_JOB, active: false })] }),
      { now: NOW }
    );
    expect(find(snap, 'payout_cron').status).toBe('fail');
  });

  it('warns when the payout job has never run', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({ jobname: PAYOUT_CRON_JOB, last_status: null, last_start: null, last_end: null }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no run recorded');
  });
});

describe('background_jobs check', () => {
  it('is ok when every other job is healthy', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({ jobname: PAYOUT_CRON_JOB }),
          job({ jobname: 'heritage-confirmation-emails' }),
          job({ jobname: 'cleanup-ringside-anon' }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'background_jobs');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('2 jobs healthy');
  });

  it('fails and lists the failing job names, driving overall fail', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({ jobname: PAYOUT_CRON_JOB }),
          job({ jobname: 'waitlist-offer-expiration', last_status: 'failed', last_message: 'boom' }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'background_jobs');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('waitlist-offer-expiration');
    expect(snap.overall_status).toBe('fail');
  });

  it('warns (not fails) when another job is only overdue', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          job({ jobname: PAYOUT_CRON_JOB }),
          job({
            jobname: 'prune-stale-ringside-sessions',
            last_start: iso(STALE_AFTER_MS + HOUR),
            last_end: iso(STALE_AFTER_MS + HOUR),
          }),
        ],
      }),
      { now: NOW }
    );
    const check = find(snap, 'background_jobs');
    expect(check.status).toBe('warn');
    expect(snap.overall_status).toBe('warn');
  });

  it('is ok with a clear detail when there are no other jobs', () => {
    const snap = buildSnapshot(facts({ cron_jobs: [job({ jobname: PAYOUT_CRON_JOB })] }), {
      now: NOW,
    });
    const check = find(snap, 'background_jobs');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('no other scheduled jobs');
  });
});

describe('migrations check (runbook 5.2 proxy)', () => {
  it('reports the newest applied migration and count', () => {
    const snap = buildSnapshot(facts(), { now: NOW });
    const check = find(snap, 'migrations');
    expect(check.status).toBe('ok');
    expect(check.detail).toBe('latest 20260704140000 (331 applied)');
  });

  it('warns when no migration is reported', () => {
    const snap = buildSnapshot(facts({ latest_migration: null, migration_count: 0 }), { now: NOW });
    const check = find(snap, 'migrations');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no applied migration');
  });

  it('omits the count label when the count is missing', () => {
    const snap = buildSnapshot(facts({ migration_count: 'oops' }), { now: NOW });
    expect(find(snap, 'migrations').detail).toBe('latest 20260704140000');
  });
});

describe('buildSnapshot — malformed facts never throw', () => {
  it('non-object facts become a single fail probe check', () => {
    for (const bad of [null, undefined, 'nope', 42]) {
      const snap = buildSnapshot(bad, { now: NOW });
      expect(snap.overall_status).toBe('fail');
      expect(snap.checks).toHaveLength(1);
      expect(snap.checks[0].key).toBe('probe');
      expect(snap.checks[0].checked_at).toBe(new Date(NOW).toISOString());
    }
  });

  it('a non-array cron_jobs degrades to payout fail + empty background, without throwing', () => {
    const snap = buildSnapshot(facts({ cron_jobs: 'not-an-array' }), { now: NOW });
    expect(find(snap, 'payout_cron').status).toBe('fail'); // job not found
    expect(find(snap, 'background_jobs').status).toBe('ok'); // no jobs
    expect(snap.overall_status).toBe('fail');
  });

  it('a malformed job entry does not throw and is treated as inactive/fail', () => {
    const snap = buildSnapshot(
      facts({ cron_jobs: [{ jobname: PAYOUT_CRON_JOB }, null, 123] }),
      { now: NOW }
    );
    // payout entry present but missing active/last_* → warn (no run recorded) or fail (inactive)
    expect(['warn', 'fail']).toContain(find(snap, 'payout_cron').status);
    // the two junk entries parse to inactive jobs → background fail, no throw
    expect(find(snap, 'background_jobs').status).toBe('fail');
  });

  it('falls back to now() for checked_at when probed_at is missing', () => {
    const snap = buildSnapshot(facts({ probed_at: undefined }), { now: NOW });
    expect(find(snap, 'migrations').checked_at).toBe(new Date(NOW).toISOString());
  });
});
