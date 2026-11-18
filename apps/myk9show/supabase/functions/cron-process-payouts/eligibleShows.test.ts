// MYK9-2183: a show still owed a payout stays eligible past the newest-1,000
// cutoff. Tested by query shape plus a small fixture rather than 1,000 rows:
// the fake answers the capped newest-shows read with a page that does not
// contain the owed show, exactly what a database with 1,000 newer shows does.
import { describe, expect, it } from 'vitest';
import { loadEligibleShows, NEWEST_SHOWS_CAP } from './eligibleShows';
import type { ProcessShowDeps } from './payoutTypes';

interface Read {
  table: string;
  calls: unknown[][];
}

const NEWER = { id: 'show-new', name: 'Newer', club_id: 'c', end_date: '2026-11-10' };
const OWED = { id: 'show-old', name: 'Old Owed', club_id: 'c', end_date: '2024-01-01' };
const SETTLED = { id: 'show-settled', name: 'Settled', club_id: 'c', end_date: '2024-01-02' };
const CANCELLED = { id: 'show-cancelled', name: 'Cancelled', club_id: 'c', end_date: '2024-01-03' };

function fakeDb() {
  const reads: Read[] = [];
  const answer = (read: Read): unknown => {
    const has = (name: string, column: string) =>
      read.calls.some(c => c[0] === name && c[1] === column);
    if (read.table === 'shows') {
      // The newest-first page is full of newer shows; the owed one is past it.
      if (has('order', 'end_date')) return [NEWER];
      // By id, with the eligibility filters: the database drops the cancelled show.
      const ids = read.calls.find(c => c[0] === 'in' && c[1] === 'id')?.[2] as string[];
      return [OWED, SETTLED].filter(show => ids.includes(show.id));
    }
    if (has('in', 'show_id')) return [{ show_id: SETTLED.id }];
    return [
      { show_id: OWED.id, status: 'awaiting_approval' },
      { show_id: SETTLED.id, status: 'failed' },
      { show_id: CANCELLED.id, status: 'held' },
      { show_id: NEWER.id, status: 'pending' },
    ];
  };
  const from = (table: string) => {
    const read: Read = { table, calls: [] };
    reads.push(read);
    const builder: Record<string, unknown> = {};
    for (const name of ['select', 'in', 'lte', 'not', 'order', 'limit', 'range']) {
      builder[name] = (...args: unknown[]) => {
        read.calls.push([name, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: answer(read), error: null }).then(resolve);
    return builder;
  };
  return { supabase: { from } as unknown as ProcessShowDeps['supabase'], reads };
}

describe('loadEligibleShows', () => {
  it('keeps a show with an outstanding payout past the newest-1,000 cutoff', async () => {
    const { supabase, reads } = fakeDb();
    const result = await loadEligibleShows(supabase, '2026-11-15');
    if (!result.ok) throw new Error(result.error);
    const ids = result.shows.map(show => show.id);
    expect(ids).toEqual(['show-new', 'show-old']);

    const newest = reads.find(r => r.table === 'shows' && r.calls.some(c => c[0] === 'order'));
    expect(newest?.calls).toContainEqual(['order', 'end_date', { ascending: false }]);
    expect(newest?.calls).toContainEqual(['limit', NEWEST_SHOWS_CAP]);
  });

  it('loads owed shows with the same eligibility checks as the newest page', async () => {
    const { supabase, reads } = fakeDb();
    await loadEligibleShows(supabase, '2026-11-15');
    const byId = reads.find(r => r.table === 'shows' && r.calls.some(c => c[0] === 'in'));
    expect(byId?.calls).toContainEqual(['in', 'id', ['show-old', 'show-cancelled']]);
    expect(byId?.calls).toContainEqual(['lte', 'end_date', '2026-11-15']);
    expect(byId?.calls).toContainEqual(['not', 'status', 'in', '("draft","cancelled")']);
  });

  it('reads every outstanding status, including a failed last attempt', async () => {
    const { supabase, reads } = fakeDb();
    await loadEligibleShows(supabase, '2026-11-15');
    const owed = reads.find(r => r.table === 'show_payouts');
    expect(owed?.calls).toContainEqual([
      'in',
      'status',
      ['pending', 'awaiting_approval', 'approved', 'held', 'failed'],
    ]);
  });
});
