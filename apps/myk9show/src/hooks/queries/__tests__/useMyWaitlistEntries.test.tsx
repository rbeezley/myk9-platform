/**
 * MYK9-417 (Codex review). The hook serves TWO numbers that look alike: the
 * display list, which a `?waitlistOffer=` deep link can extend with a terminal
 * offer so its expiry can be explained, and the count of positions the
 * exhibitor actually HOLDS, which My Shows puts on its Waitlist chip. Collapsing
 * them tells an exhibitor they are queued for a spot they have just lost.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { WaitListSection } from '@/pages/MyEntriesPage/modules/WaitListSection';

const rows = vi.hoisted(() => ({
  active: [] as unknown[],
  focused: null as unknown,
  // What `DELETE … RETURNING id` answers. Zero rows is what PostgREST returns,
  // with no error, when the DELETE policy excludes the row (it is no longer
  // 'waiting') or the row is already gone.
  deleteResult: { data: [] as { id: string }[] | null, error: null as unknown },
}));

function makeRow(id: string, status: string, position: number) {
  return {
    id,
    class_id: `class-${id}`,
    position,
    status,
    joined_via: 'online',
    offered_at: null,
    offer_expires_at: null,
    promoted_entry_id: null,
    created_at: '2026-09-01T12:00:00.000Z',
    classes: { name: 'Interior Advanced', trials: { shows: { name: 'Heartland' } } },
    dogs: { name: 'Juni', call_name: 'Juni' },
    exhibitor_profiles: { people: { first_name: 'Test', last_name: 'User' } },
  };
}

vi.mock('@/services/database/supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  // The active list resolves through `.order()`; the focused single row
  // through `.maybeSingle()`. Two terminators, so one builder serves both.
  builder.order = vi.fn(() => Promise.resolve({ data: rows.active, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: rows.focused, error: null }));
  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.eq = vi.fn(() => deleteBuilder);
  deleteBuilder.select = vi.fn(() => Promise.resolve(rows.deleteResult));
  builder.delete = vi.fn(() => deleteBuilder);
  return {
    supabase: { from: vi.fn(() => builder), functions: { invoke: vi.fn() } },
    deleteBuilder,
    selectBuilder: builder.select,
  };
});

const replica = vi.hoisted(() => ({ deleteLocal: vi.fn(async (_id: string) => {}) }));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: { delete: replica.deleteLocal },
}));

const toastSpy = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastSpy }));

import { useMyWaitlistEntries } from '../useMyWaitlistEntries';
import * as supabaseClientModule from '@/services/database/supabaseClient';
import { WAITLIST_ENTRY_CHANGED_MESSAGE } from '@/services/database/waitlists/deleteWaitlistEntry';

const { deleteBuilder, selectBuilder } = supabaseClientModule as unknown as {
  deleteBuilder: { select: ReturnType<typeof vi.fn> };
  selectBuilder: ReturnType<typeof vi.fn>;
};

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMyWaitlistEntries active position count', () => {
  beforeEach(() => {
    rows.active = [];
    rows.focused = null;
    rows.deleteResult = { data: [], error: null };
    replica.deleteLocal.mockClear();
    toastSpy.error.mockClear();
  });

  it('counts the positions the exhibitor holds', async () => {
    rows.active = [makeRow('w1', 'waiting', 1), makeRow('w2', 'offered', 2)];

    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.activePositionCount).toBe(2);
  });

  it('shows a deep-linked expired offer without counting it as a position', async () => {
    rows.focused = makeRow('w-dead', 'expired', 3);

    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1', 'w-dead'), {
      wrapper: wrapper(),
    });

    // The row reaches the display list so the section can explain it...
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    // ...and never the count My Shows puts on the Waitlist chip.
    expect(result.current.activePositionCount).toBe(0);
  });

  // MYK9-1000: Withdraw hard-deletes the server row; the secretary's replica
  // on this device must lose it too.
  it('evicts the withdrawn row from the local waitlist replica', async () => {
    rows.active = [makeRow('w1', 'waiting', 1)];
    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    rows.deleteResult = { data: [{ id: 'w1' }], error: null };

    await result.current.withdraw.mutateAsync('w1');

    // Asks for the deleted id only (LESSONS: name a column, never '*').
    expect(deleteBuilder.select).toHaveBeenCalledWith('id');
    expect(replica.deleteLocal).toHaveBeenCalledWith('w1');
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  // MYK9-1000 Codex round 2: a row offered between render and Withdraw is
  // excluded by the DELETE policy, so PostgREST deletes nothing and reports no
  // error. Evicting it would hide a live offer from this device.
  it('keeps the row and tells the exhibitor when nothing was deleted', async () => {
    rows.active = [makeRow('w1', 'waiting', 1)];
    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    rows.deleteResult = { data: [], error: null };

    await expect(result.current.withdraw.mutateAsync('w1')).rejects.toThrow(
      WAITLIST_ENTRY_CHANGED_MESSAGE
    );

    expect(replica.deleteLocal).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastSpy.error).toHaveBeenCalledWith(WAITLIST_ENTRY_CHANGED_MESSAGE)
    );
  });

  it('keeps the row and tells the exhibitor when the delete fails', async () => {
    rows.active = [makeRow('w1', 'waiting', 1)];
    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    rows.deleteResult = { data: null, error: { message: 'boom', code: '500' } };

    await expect(result.current.withdraw.mutateAsync('w1')).rejects.toBeTruthy();

    expect(replica.deleteLocal).not.toHaveBeenCalled();
    await waitFor(() => expect(toastSpy.error).toHaveBeenCalled());
  });
});

async function renderMappedOffer(joinedVia: 'mail_in' | 'online', at: string) {
  rows.active = [
    {
      ...makeRow('offer-1', 'offered', 1),
      joined_via: joinedVia,
      offered_at: '2026-01-01T15:00:00Z',
      offer_expires_at: '2026-01-03T15:00:00Z',
      promoted_entry_id: 'entry-1',
      classes: {
        name: 'Interior Advanced',
        trials: { timezone: 'America/Chicago', shows: { name: 'Heartland' } },
      },
    },
  ];
  const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
    wrapper: wrapper(),
  });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  expect(selectBuilder).toHaveBeenCalledWith(expect.stringContaining('joined_via'));
  expect(result.current.entries[0].joinedVia).toBe(joinedVia);
  const onOfferDeadlineElapsed = vi.fn();

  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  const rendered = render(
    React.createElement(WaitListSection, {
      entries: result.current.entries,
      isLoading: false,
      onWithdraw: vi.fn(),
      isWithdrawing: false,
      onStartPayment: vi.fn(),
      onDecline: vi.fn(),
      payingEntryId: null,
      decliningOfferId: null,
      paymentError: null,
      paymentErrorOfferId: null,
      declineError: null,
      declineErrorOfferId: null,
      focusedOfferId: null,
      onOfferDeadlineElapsed,
    })
  );
  return {
    offer: within(screen.getByRole('region', { name: /waitlist offer for juni/i })),
    onOfferDeadlineElapsed,
    ...rendered,
  };
}

describe('MYK9-1035 mail-in offer mapping and card', () => {
  beforeEach(() => {
    rows.active = [];
    rows.focused = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['2026-01-02T15:00:00Z', '2026-01-04T15:00:00Z'])(
    'keeps the mapped mail-in offer held without a deadline or checkout at %s',
    async at => {
      const { offer, onOfferDeadlineElapsed } = await renderMappedOffer('mail_in', at);

      expect(offer.getByText(/The club is holding this spot for you/)).toBeInTheDocument();
      expect(offer.queryByText(/Claim by|Checking whether|expired/)).not.toBeInTheDocument();
      expect(offer.queryByRole('button', { name: 'Complete payment' })).not.toBeInTheDocument();
      expect(onOfferDeadlineElapsed).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(onOfferDeadlineElapsed).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['2026-01-02T15:00:00Z', 'Claim by Sat, Jan 3, 9:00 AM CST', false],
    ['2026-01-04T15:00:00Z', 'Checking whether this offer is still available.', true],
  ])('preserves online deadline behavior at %s', async (at, expected, elapsed) => {
    const { offer, onOfferDeadlineElapsed } = await renderMappedOffer('online', at);

    expect(offer.getByText(expected)).toBeInTheDocument();
    expect(!!onOfferDeadlineElapsed.mock.calls.length).toBe(elapsed);
    expect(!!offer.queryByRole('button', { name: 'Complete payment' })).toBe(!elapsed);
  });
});
