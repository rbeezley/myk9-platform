import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-228 phase 5. The two tables the print reminder depends on had
 * divergent gates, and the mismatch failed silently in the worst direction.
 */
const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260822193000_paperwork_prints_show_scoped_secretary.sql'
  ),
  'utf8'
);

describe('paperwork_prints reaches a show-scoped secretary', () => {
  it('matches the gate trial_packet_snapshots already uses', () => {
    // `can_manage_show` resolves to `is_trial_secretary`, which requires
    // `ur.show_id IS NULL` — club-scoped roles only. A secretary assigned to a
    // single show passed `is_show_secretary` (so they saw every packet) and
    // failed `can_manage_show` (so confirmations returned zero rows, with no
    // error). Every day read "not printed", and pressing the button queued a
    // local-first write that reported success while the server rejected it.
    for (const command of ['SELECT', 'INSERT', 'UPDATE']) {
      expect(sql).toContain(`FOR ${command}`);
    }
    expect((sql.match(/is_show_secretary\(show_id\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps every guard the original policies carried', () => {
    // Widening WHO may act must not widen WHAT they may write: you still only
    // record a print you performed, and cannot insert a row born voided.
    expect(sql).toMatch(/printed_by = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/voided_at IS NULL\s*\n\s*AND voided_by IS NULL\s*\n\s*AND void_reason IS NULL/);
    expect(sql).toMatch(/voided_by = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/NULLIF\(btrim\(void_reason\), ''\) IS NOT NULL/);
  });

  it('does not hand the table to anon', () => {
    expect(sql).toMatch(/TO authenticated/);
    expect(sql).not.toMatch(/TO anon|TO public/);
  });
});
