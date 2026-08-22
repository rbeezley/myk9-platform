import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-228 phase 4 — the cron that makes the packet exist without anyone
 * remembering.
 *
 * These are source assertions, which per this repo's own LESSON can only prove
 * someone typed a thing. They are kept narrow to the properties that have no
 * other home: the claim ledger's ACL, and the scheduling contract. The
 * behaviour they guard — claim, lease, take-over, release — is covered
 * behaviourally and mutation-checked in
 * `supabase/functions/generate-trial-packet/packetGeneration.test.ts`.
 */
const sql = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260822120000_trial_packet_cron.sql'),
  'utf8'
);

/** Statements only — table names appear in prose that explains the design. */
const statements = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

describe('trial packet claim ledger', () => {
  it('keys the claim on the packet unit — one show, one trial day', () => {
    expect(sql).toMatch(
      /constraint trial_packet_generation_claims_unique_day unique \(show_id, trial_date\)/
    );
  });

  it('distinguishes a finished run from an abandoned claim', () => {
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
    expect(sql).toMatch(/alter table public\.trial_packet_generation_claims force row level security/);
    expect(sql).toMatch(/create policy trial_packet_generation_claims_deny_all/);
  });
});

describe('trial packet cron', () => {
  it('cuts the packet in each trial own evening, not in a fixed UTC hour', () => {
    // The first draft ran 21:00-23:59 UTC and let the earliest run win, so the
    // shipped packet was cut at 16:00 CDT — the AFTERNOON before, missing the
    // late scratches the evening trigger exists to capture. That is the same
    // objection this migration uses against an entry-close trigger.
    expect(statements).toMatch(/local_now := timezone\(rec\.tz, now\(\)\)/);
    expect(statements).toMatch(/continue when rec\.date <> \(local_now::date \+ 1\)/);
    expect(statements).toMatch(/extract\(hour from local_now\) not between 18 and 21/);
    expect(statements).toMatch(/'10,40 \* \* \* \*'/);
    // The old fixed-UTC target is gone, not merely supplemented.
    expect(statements).not.toMatch(/current_date \+ 1\b(?![^\n]*between)/);
  });

  it('survives one row with an unusable timezone', () => {
    // `timezone(bad, now())` raises. Without the handler a single malformed
    // row kills the run for every other show that evening.
    expect(statements).toMatch(/exception when others then/);
    expect(statements).toMatch(/local_now := timezone\('UTC', now\(\)\)/);
    expect(statements).toMatch(/coalesce\(nullif\(btrim\(t\.timezone\), ''\), 'UTC'\)/);
  });

  it('asks for one packet per show-day, not per trial', () => {
    expect(statements).toMatch(/select distinct\s*\n\s*t\.show_id,/);
    expect(statements).toMatch(/'showId', rec\.show_id/);
    expect(statements).toMatch(/'trialDate', to_char\(rec\.date, 'YYYY-MM-DD'\)/);
  });

  it('does not generate paperwork for a deleted, cancelled, or draft show', () => {
    expect(statements).toMatch(/t\.deleted_at is null/);
    expect(statements).toMatch(/s\.deleted_at is null/);
    expect(statements).toMatch(/coalesce\(t\.status, ''\) <> 'cancelled'/);
    // A draft show is not a real event, and a packet emailed for one cannot
    // be unsent.
    expect(statements).toMatch(/coalesce\(s\.status, ''\) not in \('draft', 'cancelled'\)/);
  });

  it('keeps the Vault dependency visible to audit_cron_vault_secrets', () => {
    // `list_cron_vault_secret_refs()` greps `cron.job.command` for exactly
    // this text. Reading the secret inside the function body instead would
    // hide the dependency from the guard built to catch a missing or rotated
    // secret — so the function takes them as ARGUMENTS.
    expect(statements).toMatch(
      /select decrypted_secret from vault\.decrypted_secrets where name = 'packet_cron_secret'/
    );
    expect(statements).toMatch(/request_trial_packet_generation\(\s*\n\s*\(select decrypted_secret/);
    expect(statements).toMatch(/p_base_url text,\s*\n\s*p_secret text/);
    // No secret value is ever inlined into the stored command.
    expect(statements).not.toMatch(/service_role_key|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('does not schedule before the secret it needs exists', () => {
    // Scheduling first would turn `cron-vault-secrets.integration.test.ts`
    // red — it asserts no cron job references a missing secret — and leave
    // the job raising into a void twice an hour.
    expect(statements).toMatch(
      /if exists \(select 1 from vault\.decrypted_secrets where name = 'packet_cron_secret'\)/
    );
    expect(statements).toMatch(/raise warning/);
    const guard = statements.indexOf("if exists (select 1 from vault.decrypted_secrets");
    const schedule = statements.indexOf('cron.schedule(');
    expect(guard).toBeGreaterThan(-1);
    expect(schedule).toBeGreaterThan(guard);
  });

  it('fails loudly rather than posting unauthenticated requests', () => {
    expect(statements).toMatch(/raise exception 'Missing Vault secret/);
  });

  it('schedules the evening trigger only', () => {
    // Deliberate: the issue's design section names entry close too, but its
    // acceptance criterion forbids a second packet for the same trial day.
    expect((statements.match(/cron\.schedule\(/g) ?? [])).toHaveLength(1);
    expect(statements).not.toMatch(/entry_close_date/);
  });

  it('does not let a client role call the definer that posts with a secret', () => {
    expect(statements).toMatch(/security definer/);
    expect(statements).toMatch(/set search_path = ''/);
    expect(statements).toMatch(
      /revoke all on function public\.request_trial_packet_generation\(text, text\) from public, anon, authenticated/
    );
  });

  it('gives the render longer than the pg_net five-second default', () => {
    expect(statements).toMatch(/timeout_milliseconds := 120000/);
  });
});
