import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Round-trip contract (source-level) for UX walk task 4.C.
 *
 * The DB half: submit_show_entries (the OFFLINE submission RPC) must persist the
 * exhibitor's chosen payment_method on the entry row. Before this migration it
 * accepted p_payment_method but dropped it, so cash/check entries had a NULL
 * method and My Shows nagged them with "Finish Payment" anyway (found via Codex
 * review of PR #1137).
 *
 * The client half (payment_method reaching the card) is pinned separately in
 * services/database/entries/search.test.ts (USER_ENTRIES_SELECT) and
 * features/payments/entryPaymentPrompt.test.ts. A live end-to-end round trip
 * (submit cash entry → read back method='cash') is verified against the DB after
 * `supabase db push`.
 */
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260704210000_persist_payment_method_submit_entries.sql'
  ),
  'utf8'
);

describe('submit_show_entries persists payment_method (4.C)', () => {
  it('lists payment_method in the entries INSERT column list', () => {
    const insertBlock = migration.slice(
      migration.indexOf('INSERT INTO public.entries'),
      migration.indexOf('RETURNING id INTO v_entry_id')
    );
    expect(insertBlock).toContain('payment_method');
    expect(insertBlock).toContain('p_payment_method');
  });

  it('is a CREATE OR REPLACE of the existing RPC (no signature drift)', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.submit_show_entries');
    expect(migration).toContain('p_payment_method  text');
  });

  it("widens entries_payment_method_check to admit 'group_payment' (a real wizard method)", () => {
    // Without this, persisting a 'group_payment' entry raises 23514 and fails the
    // whole submission (caught by the migration-auditor before push).
    expect(migration).toContain('entries_payment_method_check');
    expect(migration).toContain('group_payment');
  });
});
