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
  it('fires the evening before and the morning of, both targeting the trial day', () => {
    // 01:00 UTC is the evening before across US time zones and safely after
    // generation (21:00-23:59 UTC targeting current_date + 1). 12:00 UTC is
    // the morning of. Both resolve `current_date`, i.e. the trial day itself.
    expect(sql).toMatch(/'trial-packet-print-reminder-evening',\s*\n\s*'0 1 \* \* \*'/);
    expect(sql).toMatch(/'trial-packet-print-reminder-morning',\s*\n\s*'0 12 \* \* \*'/);
    expect(statements).toMatch(/where t\.date = current_date\b/);
    expect(statements).not.toMatch(/current_date \+ 1/);
  });

  it('replaces any previous schedule instead of stacking', () => {
    const unschedule = sql.indexOf('cron.unschedule(jobid)');
    expect(unschedule).toBeGreaterThan(-1);
    expect(sql.indexOf("cron.schedule(\n  'trial-packet-print-reminder-evening'")).toBeGreaterThan(
      unschedule
    );
  });

  it('does not chase paperwork for a draft or cancelled show', () => {
    expect(sql).toMatch(/coalesce\(s\.status, ''\) not in \('draft', 'cancelled'\)/);
    expect(sql).toMatch(/coalesce\(t\.status, ''\) <> 'cancelled'/);
    expect(sql).toMatch(/t\.deleted_at is null/);
  });

  it('fails loudly rather than posting unauthenticated requests twice a day', () => {
    expect(sql).toMatch(/raise exception 'Missing Vault secret/);
    expect(sql).toMatch(/name = 'packet_cron_secret'/);
    expect(sql).not.toMatch(/service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('does not let a client role call the definer that reads Vault', () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(
      /revoke all on function public\.request_trial_packet_print_reminders\(text\) from public, anon, authenticated/
    );
  });

  it('leaves the send-or-not decision to the function, not the schedule', () => {
    // The schedule stays dumb: it asks about every show running today. Whether
    // a packet exists and whether it is already printed are decisions with
    // real consequences, and they belong where they can be unit-tested.
    expect(statements).not.toMatch(/paperwork_prints/);
    expect(statements).not.toMatch(/trial_packet_snapshots/);
  });
});
