import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-228 phase 5 — the reminder that asks for PAPER.
 *
 * The trap this whole phase exists to avoid: a packet reliably appearing in
 * Storage every night is worth nothing on a laptop that will not boot, so any
 * readiness signal must read `paperwork_prints` and never the snapshot row.
 */
const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260822130000_trial_packet_print_reminder.sql'
  ),
  'utf8'
);

/**
 * Statements only. Both table names appear legitimately in the comments that
 * explain why the schedule does NOT consult them, and an assertion that cannot
 * tell prose from code would forbid documenting the decision.
 */
const statements = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

describe('print reminder ledger', () => {
  it('keeps the two slots independent', () => {
    // The morning send is the last moment paper can reach the box. If the
    // evening send suppressed it, a missed evening would cost the trial.
    expect(sql).toMatch(
      /unique \(show_id, trial_date, reminder_kind\)/
    );
    expect(sql).toMatch(/reminder_kind in \('evening-before', 'morning-of'\)/);
  });

  it('distinguishes a claimed reminder from a sent one', () => {
    expect(sql).toMatch(/sent_at timestamptz/);
    expect(sql).not.toMatch(/sent_at timestamptz not null/);
  });

  it('keeps anon and authenticated out, explicitly', () => {
    expect(sql).toMatch(/revoke all on public\.trial_packet_print_reminders from anon/);
    expect(sql).toMatch(/revoke all on public\.trial_packet_print_reminders from authenticated/);
    expect(sql).toMatch(
      /grant select, insert, update, delete on public\.trial_packet_print_reminders to service_role/
    );
    expect(sql).toMatch(/force row level security/);
    expect(sql).toMatch(/create policy trial_packet_print_reminders_deny_all/);
  });
});

describe('print reminder cron', () => {
  it('chases in each trial own local window, after generation has run', () => {
    // Generation fires in the trial's own 18:00-21:59 local; the evening chase
    // follows at 21:00-22:59 local, and the morning chase is 06:00-08:59 on
    // the day itself. A fixed UTC hour cannot be "evening" everywhere, and
    // trials.timezone is populated on every row.
    expect(statements).toMatch(/window_start := 21; window_end := 22;/);
    expect(statements).toMatch(/window_start := 6; window_end := 8;/);
    expect(statements).toMatch(/local_now := timezone\(rec\.tz, now\(\)\)/);
    expect(statements).toMatch(/extract\(hour from local_now\) not between window_start and window_end/);
  });

  it('puts the evening chase on the eve and the morning chase on the day', () => {
    expect(statements).toMatch(
      /case when p_kind = 'evening-before' then local_now::date \+ 1 else local_now::date end/
    );
  });

  it('gives each slot several attempts, so releasing a failed claim means something', () => {
    // The first draft fired each slot exactly once, fire-and-forget. With no
    // later run there was nothing to retry, so "a failed send releases the
    // claim rather than burning the slot" was simply false.
    expect(statements).toMatch(/'5,35 \* \* \* \*'/);
    expect(statements).not.toMatch(/'0 1 \* \* \*'/);
    expect(statements).not.toMatch(/'0 12 \* \* \*'/);
  });

  it('survives one row that raises, not just one with a bad timezone', () => {
    // The POST is the statement most likely to raise, and the original handler
    // covered only the timezone cast — so one bad row still lost every
    // remaining show in that run.
    expect(statements).toMatch(/exception when others then/);
    expect(statements).toMatch(/raise warning 'print reminder POST failed/);
    expect(statements).toMatch(/coalesce\(nullif\(btrim\(t\.timezone\), ''\), 'UTC'\)/);
  });

  it('replaces any previous schedule instead of stacking', () => {
    const unschedule = statements.indexOf('cron.unschedule(jobid)');
    expect(unschedule).toBeGreaterThan(-1);
    expect(statements.indexOf('cron.schedule(')).toBeGreaterThan(unschedule);
  });

  it('does not chase paperwork for a draft or cancelled show', () => {
    expect(statements).toMatch(/coalesce\(s\.status, ''\) not in \('draft', 'cancelled'\)/);
    expect(statements).toMatch(/coalesce\(t\.status, ''\) <> 'cancelled'/);
    expect(statements).toMatch(/t\.deleted_at is null/);
  });

  it('keeps the Vault dependency visible to audit_cron_vault_secrets', () => {
    // The first draft read Vault inside the function body, which hid the
    // dependency from `list_cron_vault_secret_refs()` — it greps
    // `cron.job.command` for exactly this text. The generation cron read it
    // inline and was correctly caught; this one silently escaped the guard.
    expect(statements).toMatch(
      /select decrypted_secret from vault\.decrypted_secrets where name = 'packet_cron_secret'/
    );
    expect(statements).toMatch(/p_kind text,\s*\n\s*p_base_url text,\s*\n\s*p_secret text/);
    expect(statements).not.toMatch(/service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('does not schedule before the secret it needs exists', () => {
    expect(statements).toMatch(
      /if not exists \(select 1 from vault\.decrypted_secrets where name = 'packet_cron_secret'\)/
    );
    expect(statements).toMatch(/raise warning/);
  });

  it('fails loudly rather than posting unauthenticated requests', () => {
    expect(statements).toMatch(/raise exception 'Missing Vault secret/);
  });

  it('does not let a client role call the definer that posts with a secret', () => {
    expect(statements).toMatch(/security definer/);
    expect(statements).toMatch(/set search_path = ''/);
    expect(statements).toMatch(
      /revoke all on function public\.request_trial_packet_print_reminders\(text, text, text\)\s*\n?\s*from public, anon, authenticated/
    );
  });

  it('leaves the send-or-not decision to the function, not the schedule', () => {
    // The schedule stays dumb: it asks about every show in its window. Whether
    // a packet exists and whether it is already printed are decisions with
    // real consequences, and they belong where they can be unit-tested.
    expect(statements).not.toMatch(/paperwork_prints/);
    expect(statements).not.toMatch(/trial_packet_snapshots/);
  });
});
