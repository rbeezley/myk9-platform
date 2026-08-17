import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  buildProbeFailureSnapshot,
  extractConflictCounter,
  worstOf,
  PAYOUT_CRON_JOB,
  STALE_AFTER_MS,
  type RawCronJob,
} from './systemHealthChecks';
import { anonGrants } from './anonGrantTestFixtures';
import { appliedAclFacts } from './appliedAclTestFixtures';
import { healthCheckSourceStaleAfterMs } from '../../../src/features/admin-system-health/healthCheckCadence';
import { publicSchemaAclFacts } from './publicSchemaAclTestFixtures';

// A fixed "now" so overdue/stale math is deterministic.
const NOW = Date.parse('2026-07-04T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const job = (over: Partial<RawCronJob> = {}): RawCronJob => ({
  jobname: 'some-job',
  active: true,
  dispatches_http: false,
  last_status: 'succeeded',
  last_start: iso(2 * HOUR),
  last_end: iso(2 * HOUR),
  last_message: 'DO',
  ...over,
});

// The real payout cron dispatches its Edge Function via net.http_post.
const payoutJob = (over: Partial<RawCronJob> = {}): RawCronJob =>
  job({ jobname: PAYOUT_CRON_JOB, dispatches_http: true, ...over });

const facts = (over: Record<string, unknown> = {}) => ({
  probed_at: iso(0),
  latest_migration: '20260704140000',
  migration_count: 331,
  cron_jobs: [payoutJob()],
  ringside_conflict_counter: 0,
  ringside_containment: null,
  payout_ledger: {
    total: 0,
    failed: 0,
    failed_amount_cents: 0,
    in_flight: 0,
    stale_in_flight: 0,
    oldest_in_flight_at: null,
    last_completed_at: null,
    failure_reasons: [],
  },
  sign_in_email_drift: { drifted: 0, sample: [] },
  anon_grants: anonGrants(),
  applied_acl_grants: appliedAclFacts(),
  public_schema_create_acl: publicSchemaAclFacts(),
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
    // warn, not ok: payout_cron is dispatch-only and cannot prove the payout run started, so
    // its ceiling is Unverified (TICKET-2). A fully green board would be a lie.
    expect(snap.overall_status).toBe('warn');
    expect(snap.run_duration_ms).toBe(42);
    // one entry per check; snake_case checked_at populated (board parser reads it)
    expect(snap.checks.map(c => c.key)).toEqual([
      'payout_cron',
      'payout_ledger',
      'background_jobs',
      'migrations',
      'sign_in_email_drift',
      'ringside_conflicts',
      'anon_grants',
      'applied_acl_grants',
      'public_schema_create_acl',
    ]);
    for (const c of snap.checks) {
      expect(typeof c.checked_at).toBe('string');
      expect(c).toHaveProperty('checked_at');
      expect(c).not.toHaveProperty('checkedAt');
    }
  });

  it('carries nightly checks forward during a continuous run', () => {
    const full = buildSnapshot(facts(), { now: NOW });
    const previousDeepCheck = find(full, 'anon_grants');
    const continuous = buildSnapshot(facts({ latest_migration: 'newer' }), {
      now: NOW + 5 * MIN,
      mode: 'continuous',
      previousChecks: full.checks,
    });

    expect(find(continuous, 'migrations').detail).toContain('newer');
    expect(find(continuous, 'anon_grants')).toEqual(previousDeepCheck);
    expect(find(continuous, 'applied_acl_grants')).toEqual(find(full, 'applied_acl_grants'));
  });

  it('marks deep checks unverified until the first full run', () => {
    const continuous = buildSnapshot(facts(), { now: NOW, mode: 'continuous' });
    const check = find(continuous, 'anon_grants');

    expect(check.status).toBe('warn');
    expect(check.verification).toBe('unprovable');
    expect(check.checked_at).toBeNull();
    expect(check.detail).toContain('nightly full health check');
  });

  it('defaults source and run_duration_ms when omitted', () => {
    const snap = buildSnapshot(facts(), { now: NOW });
    expect(snap.source).toBe('cron-health-check');
    expect(snap.run_duration_ms).toBeNull();
  });

  it('drives the daily snapshot red when applied ACLs drift', () => {
    const applied = appliedAclFacts();
    applied.forbidden_tables = [{ name: 'entries', role: 'authenticated', privs: 'TRUNCATE' }];

    const snap = buildSnapshot(facts({ applied_acl_grants: applied }), { now: NOW });

    expect(find(snap, 'applied_acl_grants').status).toBe('fail');
    expect(snap.overall_status).toBe('fail');
  });

  it('drives the daily snapshot red when public-schema CREATE is granted', () => {
    const publicSchemaAcl = publicSchemaAclFacts();
    publicSchemaAcl.roles = publicSchemaAcl.roles.map(row =>
      row.role === 'authenticated' ? { ...row, can_create: true } : row
    );

    const snap = buildSnapshot(facts({ public_schema_create_acl: publicSchemaAcl }), {
      now: NOW,
    });

    expect(find(snap, 'public_schema_create_acl').status).toBe('fail');
    expect(snap.overall_status).toBe('fail');
  });

  it('keeps the ACL check visible when the primary probe fails', () => {
    const snap = buildProbeFailureSnapshot('database unavailable', publicSchemaAclFacts(), {
      now: NOW,
      runDurationMs: 12,
    });

    expect(snap.checks.map(check => check.key)).toEqual(['probe', 'public_schema_create_acl']);
    expect(find(snap, 'probe').detail).toContain('database unavailable');
    expect(find(snap, 'public_schema_create_acl').status).toBe('ok');
    expect(snap.overall_status).toBe('fail');
  });
});

describe('payout_cron check (runbook 5.4)', () => {
  // TICKET-2: this check observes the scheduler handoff, not the downstream payout
  // result. Its best possible outcome is therefore Unverified (warn), and the outcome
  // question for recorded attempts belongs to payout_ledger.
  it('is Unverified — never ok — when the payout job merely dispatched', () => {
    const snap = buildSnapshot(facts(), { now: NOW });
    const check = find(snap, 'payout_cron');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain(PAYOUT_CRON_JOB);
    expect(check.detail).toContain('cannot confirm the payout run started');
    expect(check.detail).not.toContain('succeeded');
    // checked_at reflects the job's last run, not the probe time
    expect(check.checked_at).toBe(iso(0));
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
            last_start: iso(healthCheckSourceStaleAfterMs('payout_cron') + HOUR),
            last_end: iso(healthCheckSourceStaleAfterMs('payout_cron') + HOUR),
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
          job({
            jobname: 'waitlist-offer-expiration',
            last_status: 'failed',
            last_message: 'boom',
          }),
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

describe('pg_cron success semantics (Codex PR #1125)', () => {
  it('words an http-dispatch job as a sent request, not "succeeded" (green ≠ 2xx)', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          payoutJob(),
          job({ jobname: 'heritage-confirmation-emails', dispatches_http: true }),
        ],
      }),
      { now: NOW }
    );
    expect(find(snap, 'payout_cron').detail).toContain('sent the payout request');
    expect(find(snap, 'background_jobs').status).toBe('ok');
  });

  it('words a pure-SQL job as "succeeded" — pg_cron success there IS the work done', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          payoutJob(),
          // a real DELETE cron (dispatches_http false by default)
          job({ jobname: 'cleanup-ringside-anon' }),
        ],
      }),
      { now: NOW }
    );
    // one healthy pure-SQL background job → ok
    expect(find(snap, 'background_jobs').status).toBe('ok');
    expect(find(snap, 'background_jobs').detail).toContain('1 job healthy');
  });

  it('still fails a dispatch job whose scheduler run errored (caught in the DO block)', () => {
    // e.g. the live waitlist-offer-expiration "Missing Vault secret" case — the
    // RAISE fires inside the DO block BEFORE net.http_post, so pg_cron sees 'failed'.
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          payoutJob(),
          job({
            jobname: 'waitlist-offer-expiration',
            dispatches_http: true,
            last_status: 'failed',
            last_message: 'ERROR:  Missing Vault secret: cron_secret',
          }),
        ],
      }),
      { now: NOW }
    );
    const bg = find(snap, 'background_jobs');
    expect(bg.status).toBe('fail');
    expect(bg.detail).toContain('waitlist-offer-expiration');
    expect(snap.overall_status).toBe('fail');
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

// MYK9-136. A trigger makes drift unreachable through the app, so this is not
// a threshold to tune — any non-zero reading means the invariant was reached by
// a route that bypassed it, and the failure is otherwise silent until somebody
// cannot sign in.
describe('sign-in email drift check', () => {
  it('is ok when every linked person matches their identity', () => {
    const check = find(buildSnapshot(facts(), { now: NOW }), 'sign_in_email_drift');
    expect(check.status).toBe('ok');
    expect(check.delta_value).toBe(0);
  });

  it('fails on any drift, and names people so it can be acted on', () => {
    const snap = buildSnapshot(
      facts({ sign_in_email_drift: { drifted: 2, sample: ['person-a', 'person-b'] } }),
      { now: NOW }
    );
    const check = find(snap, 'sign_in_email_drift');

    expect(check.status).toBe('fail');
    expect(check.delta_value).toBe(2);
    expect(check.detail).toContain('person-a');
  });

  it('reads as unprovable rather than ok when the probe omits the fact', () => {
    const snap = buildSnapshot(facts({ sign_in_email_drift: undefined }), { now: NOW });
    const check = find(snap, 'sign_in_email_drift');

    expect(check.status).toBe('warn');
    expect(check.verification).toBe('unprovable');
  });

  it('reads as unprovable when the count is not a number', () => {
    const snap = buildSnapshot(facts({ sign_in_email_drift: { drifted: 'lots' } }), { now: NOW });
    expect(find(snap, 'sign_in_email_drift').status).toBe('warn');
  });

  it('refreshes on the continuous run rather than waiting for the nightly', () => {
    const snap = buildSnapshot(
      facts({ sign_in_email_drift: { drifted: 1, sample: ['person-a'] } }),
      { now: NOW, mode: 'continuous' }
    );
    expect(find(snap, 'sign_in_email_drift').status).toBe('fail');
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
    const snap = buildSnapshot(facts({ cron_jobs: [{ jobname: PAYOUT_CRON_JOB }, null, 123] }), {
      now: NOW,
    });
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

describe('ringside_conflicts check (2026-07-11 OCC storm)', () => {
  const withCounter = (counter: number, previous: number | null) =>
    buildSnapshot(facts({ ringside_conflict_counter: counter }), {
      now: NOW,
      previousConflictCounter: previous,
    });

  it('quiet delta below the warn threshold is ok', () => {
    const check = find(withCounter(1_500, 1_000), 'ringside_conflicts');
    expect(check.status).toBe('ok');
    // Delta and running total are named apart — conflating them in one string is
    // what made an accurate reading look like a broken counter (TICKET-1).
    expect(check.detail).toContain('500 conflicts this window');
    expect(check.detail).toContain('running total 1,500');
    expect(check.counter_value).toBe(1_500);
    expect(check.delta_value).toBe(500);
  });

  it('warn threshold boundary: delta of exactly 1,000 warns', () => {
    expect(find(withCounter(2_000, 1_000), 'ringside_conflicts').status).toBe('warn');
    expect(find(withCounter(1_999, 1_000), 'ringside_conflicts').status).toBe('ok');
  });

  it('fail threshold boundary: delta of exactly 10,000 fails and reddens the snapshot', () => {
    const snap = withCounter(11_000, 1_000);
    expect(find(snap, 'ringside_conflicts').status).toBe('fail');
    expect(snap.overall_status).toBe('fail');
    expect(find(withCounter(10_999, 1_000), 'ringside_conflicts').status).toBe('warn');
  });

  it('first run with no baseline records the counter and reads ok', () => {
    const check = find(withCounter(123, null), 'ringside_conflicts');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('baseline recorded (total 123)');
    expect(check.counter_value).toBe(123);
  });

  it('undefined baseline (option omitted) behaves like no baseline', () => {
    const snap = buildSnapshot(facts({ ringside_conflict_counter: 7 }), { now: NOW });
    const check = find(snap, 'ringside_conflicts');
    expect(check.status).toBe('ok');
    expect(check.counter_value).toBe(7);
  });

  it('counter regression (sequence reset) reads ok with a note, never a false failure', () => {
    const check = find(withCounter(5, 50_000), 'ringside_conflicts');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('counter regressed (50000 -> 5), baseline reset');
    expect(check.counter_value).toBe(5);
  });

  it('probe missing the counter fact warns (deploy-order misconfiguration is visible)', () => {
    const snap = buildSnapshot(facts({ ringside_conflict_counter: undefined }), {
      now: NOW,
      previousConflictCounter: 10,
    });
    const check = find(snap, 'ringside_conflicts');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('probe did not report ringside_conflict_counter');
    expect(check.counter_value).toBeUndefined();
  });
});

// TICKET-1. The 2026-07-31 report — "1428120 conflicts since previous snapshot
// (counter 34421500)" — was TRUE, and was read as a broken counter because it was
// a bare 24h delta with no rate and no mention of the breaker. These cases pin the
// context that makes an accurate number legible, and pin that the counter is never
// second-guessed on the basis of how few dogs are entered.
describe('ringside_conflicts — rate and containment context (TICKET-1)', () => {
  const withWindow = (
    counter: number,
    previous: number,
    minutesAgo: number,
    containment?: Record<string, unknown> | null
  ) =>
    find(
      buildSnapshot(
        facts({ ringside_conflict_counter: counter, ringside_containment: containment ?? null }),
        {
          now: NOW,
          previousConflictCounter: previous,
          previousSnapshotAt: iso(minutesAgo * MIN),
        }
      ),
      'ringside_conflicts'
    );

  const contained = {
    state: 'contained',
    tripped_at: '2026-07-31T00:27:00.000Z',
    trip_reason: 'conflict rate 2884/min exceeded threshold 300/min',
    backpressure_ms: 250,
  };

  it('expresses the delta as a rate over the real elapsed window', () => {
    // 1,440 conflicts over 1,440 minutes is 1/min — quiet, however large the delta.
    const check = withWindow(1_440, 0, 1_440);
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('1/min over 1,440 min');
    expect(check.delta_value).toBe(1_440);
  });

  it('a large delta that is a quiet rate does not fail', () => {
    // 20,000 conflicts is over the absolute FAIL_DELTA, but spread across a week
    // it is ~2/min. The rate wins when the window is known.
    expect(withWindow(20_000, 0, 7 * 24 * 60).status).toBe('ok');
  });

  it('fails at the same rate the MYK9-115 breaker trips (300/min)', () => {
    expect(withWindow(300 * 60, 0, 60).status).toBe('fail');
    expect(withWindow(299 * 60, 0, 60).status).toBe('warn');
    expect(withWindow(59 * 60, 0, 60).status).toBe('ok');
  });

  it('falls back to absolute-delta thresholds when the window is unknown', () => {
    const check = find(
      buildSnapshot(facts({ ringside_conflict_counter: 11_000 }), {
        now: NOW,
        previousConflictCounter: 1_000,
      }),
      'ringside_conflicts'
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('rate unknown');
  });

  it('a tripped breaker fails the check even with zero conflicts this window', () => {
    const check = withWindow(34_421_500, 34_421_500, 1_440, contained);
    expect(check.status).toBe('fail');
    expect(check.delta_value).toBe(0);
    expect(check.detail).toContain('CONTAINED');
    expect(check.detail).toContain('2884/min exceeded threshold 300/min');
    expect(check.detail).toContain('RS429');
  });

  it('an armed breaker adds no containment noise', () => {
    const check = withWindow(1_000, 0, 1_440, { state: 'armed', tripped_at: null });
    expect(check.status).toBe('ok');
    expect(check.detail).not.toContain('CONTAINED');
  });

  it('reports a genuinely huge count rather than calling its own counter implausible', () => {
    // The real 2026-07-29 reading. It must survive as a number: suppressing it as
    // "counter implausible" would have hidden a 16M-event incident.
    const check = withWindow(16_619_369, 36, 1_440);
    expect(check.status).toBe('fail');
    expect(check.delta_value).toBe(16_619_333);
    expect(check.detail).toContain('16,619,333 conflicts this window');
    expect(check.detail).toContain('11,541/min');
  });

  it('tolerates a malformed containment fact without throwing or greening', () => {
    for (const bad of [null, undefined, 'nope', 42, {}]) {
      const check = withWindow(10, 0, 1_440, bad as never);
      expect(check.status).toBe('ok');
      expect(check.detail).not.toContain('CONTAINED');
    }
  });
});

// TICKET-2. pg_cron reports 'succeeded' the moment net.http_post enqueues, so the
// payout_cron check cannot prove the downstream payout run started. It stays
// Unverified/amber, and a second check reads recorded attempts from the ledger.
describe('payout_ledger check (TICKET-2)', () => {
  const ledger = (over: Record<string, unknown> = {}) => ({
    total: 3,
    failed: 0,
    failed_amount_cents: 0,
    in_flight: 0,
    stale_in_flight: 0,
    oldest_in_flight_at: null,
    last_completed_at: iso(3 * HOUR),
    failure_reasons: [],
    ...over,
  });
  const withLedger = (over: Record<string, unknown> = {}) =>
    buildSnapshot(facts({ payout_ledger: ledger(over) }), { now: NOW });

  it('is ok when every payout settled', () => {
    const check = find(withLedger(), 'payout_ledger');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('all 3 payouts settled');
  });

  it('fails on a failed payout, naming the money and the reason', () => {
    const snap = withLedger({
      failed: 2,
      failed_amount_cents: 418_000,
      failure_reasons: ['expired bank details'],
    });
    const check = find(snap, 'payout_ledger');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('2 of 3 payouts failed');
    expect(check.detail).toContain('$4,180.00');
    expect(check.detail).toContain('expired bank details');
    expect(snap.overall_status).toBe('fail');
  });

  it('fails a payout stuck non-terminal past the nightly window', () => {
    const check = find(
      withLedger({ in_flight: 1, stale_in_flight: 1, oldest_in_flight_at: iso(30 * HOUR) }),
      'payout_ledger'
    );
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('never reached a terminal state');
  });

  it('an in-flight payout inside the window is ok, not a failure', () => {
    const check = find(withLedger({ in_flight: 1 }), 'payout_ledger');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('1 of 3 payouts in flight, none overdue');
  });

  it('an empty ledger is ok without claiming the downstream function ran', () => {
    const check = find(withLedger({ total: 0, last_completed_at: null }), 'payout_ledger');
    expect(check.status).toBe('ok');
    expect(check.detail).toBe('no payout attempts recorded; no failed or stalled attempts found');
  });

  // Codex review of PR #1557: validating only `total` let asCount coerce the
  // rest to zero, so a truncated probe payload rendered "all N payouts settled".
  it('a partial payload with a positive total warns instead of reporting settled', () => {
    const check = find(
      buildSnapshot(facts({ payout_ledger: { total: 5 } }), { now: NOW }),
      'payout_ledger'
    );
    expect(check.status).toBe('warn');
    expect(check.detail).not.toContain('settled');
  });

  it('a missing or malformed ledger fact warns — never a silent green', () => {
    for (const bad of [undefined, null, 'nope', 42, {}]) {
      const check = find(
        buildSnapshot(facts({ payout_ledger: bad }), { now: NOW }),
        'payout_ledger'
      );
      expect(check.status).toBe('warn');
      expect(check.detail).toBe('probe did not report payout_ledger');
    }
  });
});

describe('extractConflictCounter', () => {
  it('finds the counter_value on the ringside_conflicts check', () => {
    expect(
      extractConflictCounter([
        { key: 'payout_cron', status: 'ok' },
        { key: 'ringside_conflicts', status: 'ok', counter_value: 42 },
      ])
    ).toBe(42);
  });

  it('is tolerant: junk shapes, missing check, or non-numeric value all yield null', () => {
    expect(extractConflictCounter(null)).toBeNull();
    expect(extractConflictCounter('nope')).toBeNull();
    expect(extractConflictCounter([])).toBeNull();
    expect(extractConflictCounter([null, 3, { key: 'other' }])).toBeNull();
    expect(extractConflictCounter([{ key: 'ringside_conflicts', counter_value: '42' }])).toBeNull();
  });
});

describe('anon_grants integration', () => {
  it('drags overall_status to fail when ACL drift is detected', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'people', kind: 'r', privs: 'r' });
    expect(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }).overall_status).toBe('fail');
  });
});
