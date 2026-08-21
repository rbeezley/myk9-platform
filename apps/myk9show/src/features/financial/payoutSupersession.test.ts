/**
 * One supersession rule, shared by both cards.
 *
 * The client used to keep `max(createdAt)` under a comment claiming "a club has
 * at most one payout per show". The migration that owns this data says the
 * opposite in its own comments: the cron leaves a failed row in place and
 * INSERTs a new one on retry, and the partial unique index only bounds
 * NON-failed rows.
 *
 * The two rules agree in the common orderings, which is why this went unnoticed,
 * and diverge exactly where it costs: a show that was paid and later had an
 * attempt fail.
 */
import { describe, it, expect } from 'vitest';
import { selectAuthoritativePayout, isSupersededFailure } from './payoutSupersession';

interface Row {
  id: string;
  status: string;
  createdAt: string;
}
const read = (row: Row) => ({ status: row.status, createdAt: row.createdAt, id: row.id });

const failed = (id: string, createdAt: string): Row => ({ id, status: 'failed', createdAt });
const live = (id: string, status: string, createdAt: string): Row => ({ id, status, createdAt });

describe('selectAuthoritativePayout', () => {
  it('prefers the live row even when a failed row is NEWER', () => {
    // The divergence that mattered: max(createdAt) picked the failed row and
    // the card showed a red "Needs attention" beside money already transferred.
    const rows = [
      live('paid', 'completed', '2026-06-01T00:00:00Z'),
      failed('f', '2026-06-09T00:00:00Z'),
    ];
    expect(selectAuthoritativePayout(rows, read)?.id).toBe('paid');
  });

  it('prefers the live row when it is newer, which is the ordinary retry', () => {
    const rows = [
      failed('f', '2026-06-01T00:00:00Z'),
      live('paid', 'completed', '2026-06-09T00:00:00Z'),
    ];
    expect(selectAuthoritativePayout(rows, read)?.id).toBe('paid');
  });

  it('treats pending and processing as live, not just completed', () => {
    for (const status of ['pending', 'processing']) {
      const rows = [failed('f', '2026-06-09T00:00:00Z'), live('l', status, '2026-06-01T00:00:00Z')];
      expect(selectAuthoritativePayout(rows, read)?.id).toBe('l');
    }
  });

  it('falls back to the LATEST failed attempt when there is no live row', () => {
    const rows = [failed('old', '2026-06-01T00:00:00Z'), failed('new', '2026-06-09T00:00:00Z')];
    expect(selectAuthoritativePayout(rows, read)?.id).toBe('new');
  });

  it('returns null for a show with no payout rows', () => {
    expect(selectAuthoritativePayout([], read)).toBeNull();
  });
});

describe('isSupersededFailure', () => {
  it('a failed row with any live sibling is history, whatever the order', () => {
    const older = failed('f', '2026-06-09T00:00:00Z');
    const rows = [older, live('paid', 'completed', '2026-06-01T00:00:00Z')];
    expect(isSupersededFailure(older, rows, read)).toBe(true);
  });

  it('an earlier failed attempt is superseded by a later failed attempt', () => {
    const first = failed('f1', '2026-06-01T00:00:00Z');
    const rows = [first, failed('f2', '2026-06-09T00:00:00Z')];
    expect(isSupersededFailure(first, rows, read)).toBe(true);
  });

  it('the LATEST failure with no live sibling is genuinely outstanding', () => {
    const latest = failed('f2', '2026-06-09T00:00:00Z');
    const rows = [failed('f1', '2026-06-01T00:00:00Z'), latest];
    expect(isSupersededFailure(latest, rows, read)).toBe(false);
  });

  it('a lone failure is outstanding', () => {
    const only = failed('f', '2026-06-01T00:00:00Z');
    expect(isSupersededFailure(only, [only], read)).toBe(false);
  });

  it('a non-failed row is never superseded', () => {
    const paid = live('paid', 'completed', '2026-06-01T00:00:00Z');
    expect(isSupersededFailure(paid, [paid, failed('f', '2026-06-09T00:00:00Z')], read)).toBe(
      false
    );
  });
});

describe('ties on created_at', () => {
  // The RPC orders by the tuple `(created_at, id)`. Rows inserted in one
  // transaction, or imported, can share a timestamp -- and a timestamp-only
  // comparison finds neither row newer, so BOTH failures read as outstanding
  // and one show shows two "Needs attention" badges.
  const SAME = '2026-06-09T00:00:00Z';

  it('breaks a tie by id, the way the RPC does', () => {
    const rows = [failed('aaa', SAME), failed('bbb', SAME)];
    expect(selectAuthoritativePayout(rows, read)?.id).toBe('bbb');
  });

  it('supersedes the lower id, so exactly one failure stays outstanding', () => {
    const lower = failed('aaa', SAME);
    const higher = failed('bbb', SAME);
    const rows = [lower, higher];
    expect(isSupersededFailure(lower, rows, read)).toBe(true);
    expect(isSupersededFailure(higher, rows, read)).toBe(false);
  });

  it('a live row still wins a tie against a failed one', () => {
    const rows = [failed('zzz', SAME), live('aaa', 'completed', SAME)];
    expect(selectAuthoritativePayout(rows, read)?.id).toBe('aaa');
    expect(isSupersededFailure(rows[0], rows, read)).toBe(true);
  });
});
