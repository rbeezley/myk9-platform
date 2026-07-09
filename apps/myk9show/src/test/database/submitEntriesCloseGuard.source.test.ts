import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Source-level contract for exhibitor-closed-show-server-guard.
 *
 * submit_show_entries (the OFFLINE submission RPC) must refuse self-service
 * submissions once a show's entry period has closed, while still letting show
 * officials add late/day-of entries. The boundary is a timezone-anchored
 * calendar day (see design.md), NOT a UTC instant, so an exhibitor is never
 * blocked before the end of the local close day.
 *
 * The live behavior (non-official closed-show submit raises 42501; official
 * bypass succeeds) is verified in a rolled-back psql transaction during the
 * ship phase; this test pins the migration source so the guard can't silently
 * regress or drift its bypass.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260708130000_guard_submit_show_entries_entry_close.sql'
  ),
  'utf8'
);

describe('submit_show_entries entry-period guard', () => {
  it('is a CREATE OR REPLACE of the RPC with an unchanged signature', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.submit_show_entries');
    expect(migration).toContain('p_payment_method   text');
  });

  it('loads the close deadline and the show timezone before the guard', () => {
    expect(migration).toContain('entry_close_date');
    expect(migration).toContain('v_show_close');
    expect(migration).toContain('v_show_tz');
    // primary-trial timezone with a sane default
    expect(migration).toContain("'America/New_York'");
    expect(migration).toContain('FROM public.trials t');
  });

  it('refuses non-official submissions once the local close day has passed', () => {
    const guard = migration.slice(
      migration.indexOf('3a.'),
      migration.indexOf('-- 4. Payment method authorization')
    );
    expect(guard).toContain('NOT v_is_official');
    expect(guard).toContain('v_show_close IS NOT NULL');
    // timezone-anchored calendar-day comparison, not a raw instant compare
    expect(guard).toContain("(now() AT TIME ZONE v_show_tz)::date");
    expect(guard).toContain("(v_show_close AT TIME ZONE 'UTC')::date");
    expect(guard).toContain('RAISE EXCEPTION');
    expect(guard).toContain("ERRCODE = '42501'");
  });

  it('places the guard so officials (secretary/club admin/site admin) bypass it', () => {
    // v_is_official is assigned from the three official-role checks, and the
    // guard must reference it (so officials skip the refusal) after it exists.
    expect(migration).toContain('public.is_show_secretary(p_show_id)');
    expect(migration).toContain('public.is_club_admin(v_show_club_id)');
    expect(migration.indexOf('v_is_official := (')).toBeLessThan(
      migration.indexOf('3a.')
    );
  });
});
