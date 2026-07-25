import { describe, it, expect } from 'vitest';
import {
  buildSnapshot,
  extractConflictCounter,
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

/**
 * A healthy `anon_grants` block, transcribed from the APPLIED staging ACLs after
 * MYK9-93 (migrations 20260725150000–180000). Table-level grants for the 21
 * allowlisted relations plus the release-gate view; column-level grants for the
 * three embed/allowlist tables; the one inert supabase_admin default that cannot be
 * revoked on a hosted project.
 */
const anonGrants = (over: Record<string, unknown> = {}) => ({
  tables: [
    ...[
      'achievements',
      'armbands',
      'class_visibility_overrides',
      'classes',
      'clubs',
      'judge_assignments',
      'rule_organizations',
      'rule_sports',
      'rulebooks',
      'rules',
      'show_templates',
      'show_visibility_settings',
      'shows',
      'sport_class_rules',
      'sport_templates',
      'sport_titles',
      'template_fields',
      'trial_visibility_overrides',
      'trials',
      'user_guide',
    ].map(name => ({ name, kind: 'r', privs: 'r' })),
    { name: 'platform_waitlist', kind: 'r', privs: 'a' },
    { name: 'view_public_entry_results', kind: 'v', privs: 'r' },
  ],
  columns: [
    ...['id', 'name', 'call_name', 'breed', 'image_url'].map(column => ({
      name: 'dogs',
      column,
      privs: 'r',
    })),
    ...['id', 'first_name', 'last_name', 'email'].map(column => ({
      name: 'people',
      column,
      privs: 'r',
    })),
    ...['id', 'armband', 'run_order', 'is_in_ring', 'is_scored'].map(column => ({
      name: 'entries',
      column,
      privs: 'r',
    })),
  ],
  defaults: [{ grantor: 'supabase_admin', objtype: 'r', privs: 'arwdDxtm' }],
  ...over,
});

const facts = (over: Record<string, unknown> = {}) => ({
  probed_at: iso(0),
  latest_migration: '20260704140000',
  migration_count: 331,
  cron_jobs: [payoutJob()],
  ringside_conflict_counter: 0,
  anon_grants: anonGrants(),
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
    expect(snap.checks.map(c => c.key)).toEqual([
      'payout_cron',
      'background_jobs',
      'migrations',
      'ringside_conflicts',
      'anon_grants',
    ]);
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
    // http-dispatch job: green means "dispatched", not "Edge Function returned 2xx"
    expect(check.detail).toContain('dispatched');
    expect(check.detail).not.toContain('succeeded');
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

describe('pg_cron success semantics (Codex PR #1125)', () => {
  it('words an http-dispatch job as "dispatched", not "succeeded" (green ≠ 2xx)', () => {
    const snap = buildSnapshot(
      facts({
        cron_jobs: [
          payoutJob(),
          job({ jobname: 'heritage-confirmation-emails', dispatches_http: true }),
        ],
      }),
      { now: NOW }
    );
    expect(find(snap, 'payout_cron').detail).toContain('dispatched');
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

describe('ringside_conflicts check (2026-07-11 OCC storm)', () => {
  const withCounter = (counter: number, previous: number | null) =>
    buildSnapshot(facts({ ringside_conflict_counter: counter }), {
      now: NOW,
      previousConflictCounter: previous,
    });

  it('quiet delta below the warn threshold is ok', () => {
    const check = find(withCounter(1_500, 1_000), 'ringside_conflicts');
    expect(check.status).toBe('ok');
    expect(check.detail).toBe('500 conflicts since previous snapshot (counter 1500)');
    expect(check.counter_value).toBe(1_500);
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
    expect(check.detail).toContain('baseline recorded (counter 123)');
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
    expect(check.detail).toBe('counter regressed (50000 -> 5), baseline reset');
    expect(check.counter_value).toBe(5);
  });

  it('probe missing the counter fact warns (deploy-order misconfiguration is visible)', () => {
    const snap = buildSnapshot(facts({ ringside_conflict_counter: undefined }), {
      now: NOW,
      previousConflictCounter: 10,
    });
    const check = find(snap, 'ringside_conflicts');
    expect(check.status).toBe('warn');
    expect(check.detail).toBe('probe did not report ringside_conflict_counter');
    expect(check.counter_value).toBeUndefined();
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

describe('anon_grants check (MYK9-93 drift against applied ACLs)', () => {
  it('is ok on the post-MYK9-93 baseline', () => {
    const check = find(buildSnapshot(facts(), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('22 table grants (1 write)');
    expect(check.detail).toContain('14 column grants');
  });

  it('fails when a table not on the allowlist gains an anon grant (the dog_favorites case)', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'dog_favorites', kind: 'r', privs: 'arwdDxtm' });
    const check = find(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('dog_favorites');
    expect(check.detail).toContain('not on the anon allowlist');
  });

  it('fails when an allowlisted table gains a write privilege', () => {
    const grants = anonGrants();
    grants.tables = grants.tables.map(t => (t.name === 'shows' ? { ...t, privs: 'rw' } : t));
    const check = find(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain("shows has 'rw', expected 'r'");
  });

  it('fails when entries gains a TABLE-level grant — the regression MYK9-93 shipped', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'entries', kind: 'r', privs: 'r' });
    const check = find(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('release-gate allowlist is bypassed');
  });

  it('fails when a column grant appears on an unexpected table', () => {
    const grants = anonGrants();
    grants.columns.push({ name: 'dog_registrations', column: 'registration_number', privs: 'r' });
    const check = find(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('dog_registrations.registration_number');
  });

  it('fails when a revoked default privilege comes back under another grantor', () => {
    const grants = anonGrants();
    grants.defaults.push({ grantor: 'postgres', objtype: 'r', privs: 'arwdDxtm' });
    const check = find(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('restored by postgres');
  });

  it('tolerates the inert supabase_admin default without flagging it', () => {
    const check = find(buildSnapshot(facts(), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('ok');
    expect(check.detail).not.toContain('supabase_admin');
  });

  it('warns (not fails) when the probe predates the fact — function not yet redeployed', () => {
    const check = find(buildSnapshot(facts({ anon_grants: undefined }), { now: NOW }), 'anon_grants');
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('no anon_grants facts');
  });

  it('never throws on malformed rows; degrades to a visible fail', () => {
    for (const bad of [{ tables: 'nope' }, { tables: [null, 42] }, { columns: [{}] }]) {
      const snap = buildSnapshot(facts({ anon_grants: bad }), { now: NOW });
      expect(['ok', 'warn', 'fail']).toContain(find(snap, 'anon_grants').status);
    }
    const snap = buildSnapshot(facts({ anon_grants: { tables: [null] } }), { now: NOW });
    expect(find(snap, 'anon_grants').status).toBe('fail');
  });

  it('drags overall_status to fail so /admin/health goes red', () => {
    const grants = anonGrants();
    grants.tables.push({ name: 'people', kind: 'r', privs: 'r' });
    expect(buildSnapshot(facts({ anon_grants: grants }), { now: NOW }).overall_status).toBe('fail');
  });
});
