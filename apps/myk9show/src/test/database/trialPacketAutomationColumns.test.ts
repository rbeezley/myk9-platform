import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-228 phase 3 — dropping a NOT NULL is the kind of change that is easy to
 * make and hard to notice going wrong, because nothing fails until a row that
 * should have had an author does not.
 */
const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260821230000_trial_packet_automation_columns.sql'
  ),
  'utf8'
);

describe('trial packet automation columns', () => {
  it('lets an automated packet exist without inventing an author', () => {
    expect(sql).toMatch(/ALTER COLUMN generated_by DROP NOT NULL/);
  });

  it('still requires an author on the path that has one', () => {
    // The whole risk of dropping the NOT NULL: a manual packet with no
    // generated_by would be a row claiming a person asked for it while
    // recording no person. The CHECK is what keeps the relaxation scoped.
    expect(sql).toMatch(
      /CHECK \(generated_source <> 'manual' OR generated_by IS NOT NULL\)/
    );
    expect(sql).toMatch(/CHECK \(generated_source IN \('manual', 'automated'\)\)/);
  });

  it('records which day a packet covers', () => {
    // The trigger's idempotency key is (show, trial date). Without the column
    // "has tonight's packet already gone out?" is unanswerable, and the
    // storage path carries only a snapshot UUID.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS trial_date DATE/);
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS trial_packet_snapshots_show_day_idx[\s\S]*?\(show_id, trial_date, delivery_status\)/
    );
  });

  it('leaves the existing manual rows valid', () => {
    // `generated_source` defaults to 'manual' and every existing row has a
    // generated_by, so the new CHECK cannot fail on the backfill. A default of
    // 'automated' would have made every historical row violate it.
    expect(sql).toMatch(/generated_source TEXT NOT NULL DEFAULT 'manual'/);
    // No blanket UPDATE: the default covers the backfill, and rewriting rows in
    // an append-only audit table would be a lie about when they were written.
    expect(sql).not.toMatch(/UPDATE public\.trial_packet_snapshots/);
  });
});
