import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-228 phase 4 — the cron that makes the packet exist without anyone
 * remembering. These pin the properties that cannot be observed from the
 * application: the claim ledger's shape and ACL, and the scheduling window.
 */
const sql = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260822120000_trial_packet_cron.sql'),
  'utf8'
);

describe('trial packet claim ledger', () => {
  it('keys the claim on the packet unit — one show, one trial day', () => {
    expect(sql).toMatch(
      /constraint trial_packet_generation_claims_unique_day unique \(show_id, trial_date\)/
    );
    // The unique constraint IS the concurrency control: without it two
    // overlapping cron runs both render and the secretary gets two emails.
    expect(sql).toMatch(/create table if not exists public\.trial_packet_generation_claims/);
  });

  it('distinguishes a finished run from an abandoned claim', () => {
    // A claim alone proves only that a run started. Reading the unique
    // conflict as "already done" would leave a dead run's trial with no paper.
    expect(sql).toMatch(/completed_at timestamptz/);
    expect(sql).not.toMatch(/completed_at timestamptz not null/);
  });

  it('keeps anon and authenticated out, explicitly', () => {
    // ALTER DEFAULT PRIVILEGES in this project grants anon full CRUD on every
    // new public table, so the REVOKEs are required rather than tidy-up.
    expect(sql).toMatch(/revoke all on public\.trial_packet_generation_claims from anon/);
    expect(sql).toMatch(/revoke all on public\.trial_packet_generation_claims from authenticated/);
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.trial_packet_generation_claims to service_role/
    );
    expect(sql).toMatch(/alter table public\.trial_packet_generation_claims enable row level security/);
    // FORCE so the migrations-only rebuild owner is subject to the policy too.
    expect(sql).toMatch(/alter table public\.trial_packet_generation_claims force row level security/);
    expect(sql).toMatch(/create policy trial_packet_generation_claims_deny_all/);
    expect(sql).toMatch(/using \(false\)/);
  });
});

describe('trial packet cron', () => {
  it('replaces any previous schedule instead of stacking a second one', () => {
    const unschedule = sql.indexOf("cron.unschedule(jobid) from cron.job where jobname = 'trial-packet-show-eve'");
    const schedule = sql.indexOf("cron.schedule(\n  'trial-packet-show-eve'");
    expect(unschedule).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(unschedule);
  });

  it('runs entirely inside one UTC day so the target date cannot shift mid-window', () => {
    // The job resolves `current_date + 1`. A window spanning midnight UTC
    // would target two different dates in one evening — generating tomorrow's
    // packet twice under two different keys.
    const schedule = sql.match(/'0,30 21,22,23 \* \* \*'/);
    expect(schedule).not.toBeNull();
    expect(sql).toMatch(/target_date date := current_date \+ 1/);
  });

  it('asks for one packet per show-day, not per trial', () => {
    // A Sunday running three trials is ONE packet holding three trial
    // sections — `select distinct` on (show_id, date) is what enforces it.
    expect(sql).toMatch(/select distinct t\.show_id, t\.date/);
    expect(sql).toMatch(/'showId', rec\.show_id/);
    expect(sql).toMatch(/'trialDate', to_char\(rec\.date, 'YYYY-MM-DD'\)/);
  });

  it('does not generate paperwork for a deleted or cancelled trial', () => {
    expect(sql).toMatch(/t\.deleted_at is null/);
    expect(sql).toMatch(/s\.deleted_at is null/);
    expect(sql).toMatch(/coalesce\(t\.status, ''\) <> 'cancelled'/);
  });

  it('does not email officials about a show that was never published', () => {
    // shows_status_check permits 'draft'. A draft show is not a real event,
    // and a packet emailed for one cannot be unsent.
    expect(sql).toMatch(/coalesce\(s\.status, ''\) not in \('draft', 'cancelled'\)/);
  });

  it('gives the render longer than the pg_net five-second default', () => {
    // A three-trial Sunday is ~110 pages plus upload plus email. If the worker
    // abandons the connection mid-render the edge runtime may tear down the
    // isolate, leaving a claim held with no packet behind it — recoverable
    // only after the lease, and not at all past the last run of the evening.
    expect(sql).toMatch(/timeout_milliseconds := 120000/);
  });

  it('fails loudly rather than posting unauthenticated requests all evening', () => {
    // A missing Vault secret would otherwise send `Bearer ` six times a night
    // to a function that answers 401, with nothing anywhere saying why.
    expect(sql).toMatch(/raise exception 'Missing Vault secret/);
    expect(sql).toMatch(/name = 'packet_cron_secret'/);
    // The secret travels in the header; no service-role key is ever inlined.
    expect(sql).toMatch(/'Authorization', 'Bearer ' \|\| packet_secret/);
    expect(sql).not.toMatch(/service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('schedules the evening trigger only', () => {
    // Deliberate: the issue's design section names entry close too, but its
    // acceptance criterion forbids a second packet for the same trial day, and
    // an entry-close packet would make the evening run a no-op — shipping the
    // OLDER paper to the trial box.
    const jobs = sql.match(/cron\.schedule\(/g) ?? [];
    expect(jobs).toHaveLength(1);
    expect(sql).not.toMatch(/entry_close_date/);
  });
});
