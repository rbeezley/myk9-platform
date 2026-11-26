// MYK9-2182: the database side of the daily approval reminder. Each query's
// table, columns and filters are value-sensitive (a wrong status string or
// column reminds approved payouts, or never), so they are pinned here.
import { describe, expect, it } from 'vitest';
import { createReminderStore } from './approvalReminderStore';
import type { ProcessShowDeps } from './payoutTypes';

interface Call {
  table: string;
  steps: unknown[][];
}

function fakeClient(answer: (call: Call) => { data: unknown; error: { message: string } | null }) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, steps: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const name of ['select', 'update', 'eq', 'gt', 'or', 'order', 'limit']) {
      builder[name] = (...args: unknown[]) => {
        call.steps.push([name, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(answer(call)).then(resolve);
    return builder;
  };
  return { supabase: { from } as unknown as ProcessShowDeps['supabase'], calls };
}

const CUTOFF = '2026-11-24T12:00:00.000Z';
const STAMP = '2026-11-25T08:00:00.000Z';
const DUE_FILTER = `approval_reminded_at.is.null,approval_reminded_at.lt."${CUTOFF}"`;
const PAYOUT = {
  id: 'p-1',
  showId: 's-1',
  showName: 'Fall Trial',
  amountCents: 12345,
  remindedAt: '2026-11-24T07:00:00.000Z',
};

describe('createReminderStore', () => {
  it('lists due waiting payouts by id after the last one, with the show name', async () => {
    const { supabase, calls } = fakeClient(() => ({
      data: [
        {
          id: 'p-1',
          show_id: 's-1',
          amount_cents: 12345,
          approval_reminded_at: null,
          shows: { name: 'Fall Trial' },
        },
        { id: 'p-2', show_id: 's-2', amount_cents: 500, approval_reminded_at: null, shows: null },
      ],
      error: null,
    }));
    const store = createReminderStore(supabase);
    const listed = await store.listDue({ cutoffIso: CUTOFF, afterId: 'p-0', limit: 50 });

    expect(calls[0].table).toBe('show_payouts');
    expect(calls[0].steps).toEqual([
      ['select', 'id, show_id, amount_cents, approval_reminded_at, shows(name)'],
      ['eq', 'status', 'awaiting_approval'],
      ['or', DUE_FILTER],
      ['order', 'id', { ascending: true }],
      ['limit', 50],
      ['gt', 'id', 'p-0'],
    ]);
    expect(listed).toEqual([
      { id: 'p-1', showId: 's-1', showName: 'Fall Trial', amountCents: 12345, remindedAt: null },
      { id: 'p-2', showId: 's-2', showName: null, amountCents: 500, remindedAt: null },
    ]);
  });

  it('starts from the first id when there is no previous batch', async () => {
    const { supabase, calls } = fakeClient(() => ({ data: [], error: null }));
    await createReminderStore(supabase).listDue({ cutoffIso: CUTOFF, afterId: null, limit: 50 });
    expect(calls[0].steps.some(step => step[0] === 'gt')).toBe(false);
  });

  it('reads a failed list as null, not as nothing due', async () => {
    const { supabase } = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
    const store = createReminderStore(supabase);
    expect(await store.listDue({ cutoffIso: CUTOFF, afterId: null, limit: 50 })).toBeNull();
  });

  it('claims a payout only while it is still waiting and due', async () => {
    const { supabase, calls } = fakeClient(() => ({ data: [{ id: 'p-1' }], error: null }));
    const claim = await createReminderStore(supabase).claim(PAYOUT, {
      cutoffIso: CUTOFF,
      stampIso: STAMP,
    });
    expect(claim).toBe('claimed');
    expect(calls[0].table).toBe('show_payouts');
    expect(calls[0].steps).toEqual([
      ['update', { approval_reminded_at: STAMP }],
      ['eq', 'id', 'p-1'],
      ['eq', 'status', 'awaiting_approval'],
      ['or', DUE_FILTER],
      ['select', 'id'],
    ]);
  });

  it('reads a claim that changed no row as gone, and an error as error', async () => {
    const gone = fakeClient(() => ({ data: [], error: null }));
    expect(
      await createReminderStore(gone.supabase).claim(PAYOUT, { cutoffIso: CUTOFF, stampIso: STAMP })
    ).toBe('gone');
    const failed = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
    expect(
      await createReminderStore(failed.supabase).claim(PAYOUT, {
        cutoffIso: CUTOFF,
        stampIso: STAMP,
      })
    ).toBe('error');
  });

  it('puts the listed stamp back only where this run stamped it', async () => {
    const { supabase, calls } = fakeClient(() => ({ data: null, error: null }));
    expect(await createReminderStore(supabase).release(PAYOUT, STAMP)).toBe(true);
    expect(calls[0].steps).toEqual([
      ['update', { approval_reminded_at: '2026-11-24T07:00:00.000Z' }],
      ['eq', 'id', 'p-1'],
      ['eq', 'approval_reminded_at', STAMP],
    ]);
  });
});
