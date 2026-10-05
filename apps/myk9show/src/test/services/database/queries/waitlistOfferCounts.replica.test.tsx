/**
 * MYK9-1001 (Codex round 3 on #2772): after Offer and after Withdraw, the class counts the
 * Waitlist tab computes from the REPLICA must match the server at once, not after the next sync.
 * An offer creates a pending-payment entry that takes a seat; a withdrawal turns it into
 * promotion-expired and frees the seat. The waitlist and entries replicas here are the real
 * tables; only the server (supabase) and the class/trial lookups are stubbed.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

type Row = Record<string, unknown>;

const server = vi.hoisted(() => ({
  waitlist: new Map<string, Row>(),
  entries: new Map<string, Row>(),
}));

vi.mock('@myk9/core', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/core')>()),
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      in: (_column: string, ids: string[]) =>
        Promise.resolve({
          data:
            table === 'view_authenticated_entry_results_replication'
              ? ids.map(id => server.entries.get(id)).filter(Boolean)
              : [],
          error: null,
        }),
      maybeSingle: () => {
        const id = filters.find(([c]) => c === 'id')?.[1] as string;
        return Promise.resolve({
          data: table === 'waitlist_entries' ? (server.waitlist.get(id) ?? null) : null,
          error: null,
        });
      },
    };
    return builder;
  };
  return {
    supabase: {
      from,
      // promote_waitlist_entry, as the server commits it.
      rpc: async (fn: string, args: { p_waitlist_entry_id: string }) => {
        if (fn !== 'promote_waitlist_entry') return { data: null, error: null };
        const wl = server.waitlist.get(args.p_waitlist_entry_id)!;
        server.entries.set('entry-new', {
          id: 'entry-new',
          class_id: wl.class_id,
          show_id: 'show-1',
          dog_id: wl.dog_id,
          entry_status: 'pending-payment',
          payment_status: 'pending',
          version: 1,
        });
        server.waitlist.set(wl.id as string, {
          ...wl,
          status: 'offered',
          promoted_entry_id: 'entry-new',
          offered_at: '2026-10-05T15:00:00Z',
          offer_expires_at: '2026-10-07T15:00:00Z',
          updated_at: '2026-10-05T15:00:00Z',
        });
        return { data: 'entry-new', error: null };
      },
      functions: {
        // withdraw-waitlist-offer, as the server commits it.
        invoke: async (_fn: string, { body }: { body: { waitlist_entry_id: string } }) => {
          const wl = server.waitlist.get(body.waitlist_entry_id)!;
          const entry = server.entries.get(wl.promoted_entry_id as string)!;
          server.entries.set(entry.id as string, {
            ...entry,
            entry_status: 'promotion-expired',
            version: 2,
          });
          server.waitlist.set(wl.id as string, { ...wl, status: 'withdrawn' });
          return { data: { status: 'withdrawn', notified: true }, error: null };
        },
      },
    },
    logQuery: vi.fn(),
    createDatabaseError,
  };
});

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialsByShow: async () => [{ id: 'trial-1', showId: 'show-1', name: 'Trial 1' }],
    getTrialById: async () => ({ id: 'trial-1', showId: 'show-1', name: 'Trial 1' }),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassesByTrial: async () => [
      { id: 'class-1', name: 'Novice A', trialId: 'trial-1', maxEntries: 2 },
    ],
    getClassById: async () => ({
      id: 'class-1',
      name: 'Novice A',
      trialId: 'trial-1',
      maxEntries: 2,
    }),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getDogById: async (id: string) => ({ id, callName: id }) },
}));

import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  promoteWaitlistEntry,
  withdrawWaitlistOffer,
} from '@/services/database/waitlists';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { WaitlistTable } from '@/pages/secretary/WaitlistManagementPage/WaitlistTable';

const waitingRow = (id: string, dog: string, position: number): Row => ({
  id,
  class_id: 'class-1',
  dog_id: dog,
  exhibitor_id: 'ex-1',
  handler_id: null,
  position,
  status: 'waiting',
  joined_via: 'online',
  offered_at: null,
  offer_expires_at: null,
  promoted_entry_id: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
});

const confirmedEntry = (id: string): Row => ({
  id,
  class_id: 'class-1',
  show_id: 'show-1',
  dog_id: `dog-${id}`,
  entry_status: 'confirmed',
  payment_status: 'paid',
  version: 1,
});

async function seed(entryIds: string[], waitlist: Row[]) {
  for (const id of entryIds) {
    server.entries.set(id, confirmedEntry(id));
    await replicatedEntriesTable.set(
      id,
      { id, classId: 'class-1', showId: 'show-1', entryStatus: 'confirmed' },
      false,
      undefined,
      1,
      { allowColdInsert: 'test fixture standing in for the sync download' }
    );
  }
  for (const row of waitlist) {
    server.waitlist.set(row.id as string, row);
    const { rowToWaitlistEntry } =
      await import('@/services/replication/ReplicatedWaitlistEntriesTable');
    await replicatedWaitlistEntriesTable.set(row.id as string, rowToWaitlistEntry(row as never));
  }
}

async function tabClass() {
  const { data } = await getClassesWithWaitlistCounts('show-1');
  return data[0]!;
}

/** Whether the queue card for the class, as the tab renders it, offers a spot to the next dog. */
async function offerSpotShown(): Promise<boolean> {
  const cls = await tabClass();
  const queue = (await getWaitlistByClass('class-1')).data;
  const { unmount } = render(
    <WaitlistTable
      entries={queue}
      selectedClass={cls}
      isLoading={false}
      searchActive={false}
      onSetActionDialog={vi.fn()}
    />
  );
  const shown = screen.queryAllByRole('button', { name: /Offer Spot/ }).length > 0;
  unmount();
  return shown;
}

describe('offer actions keep the replica counts equal to the server', () => {
  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    server.waitlist.clear();
    server.entries.clear();
  });
  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('counts the pending-payment entry an offer creates, so the tab never offers that seat twice', async () => {
    // Class of 2: one confirmed entry, two dogs waiting; one seat free.
    await seed(['e1'], [waitingRow('wl-1', 'dog-a', 1), waitingRow('wl-2', 'dog-b', 2)]);
    expect((await tabClass()).accepted_count).toBe(1);

    await promoteWaitlistEntry('wl-1');

    expect(await tabClass()).toMatchObject({
      accepted_count: 2,
      waitlist_count: 1,
      offered_count: 1,
    });
    expect(await offerSpotShown()).toBe(false);
    expect((await getWaitlistByClass('class-1')).data.map(e => e.id)).toEqual(['wl-2']);
    expect((await replicatedEntriesTable.get('entry-new'))?.entryStatus).toBe('pending-payment');
  });

  it('frees the seat a withdrawn offer held, so "Offer Spot" shows for the next dog', async () => {
    await seed(['e1'], [waitingRow('wl-1', 'dog-a', 1), waitingRow('wl-2', 'dog-b', 2)]);
    await promoteWaitlistEntry('wl-1');
    expect(await offerSpotShown()).toBe(false);

    await withdrawWaitlistOffer('wl-1');

    expect(await tabClass()).toMatchObject({
      accepted_count: 1,
      waitlist_count: 1,
      offered_count: 0,
    });
    expect(await offerSpotShown()).toBe(true);
    expect((await replicatedEntriesTable.get('entry-new'))?.entryStatus).toBe('promotion-expired');
    expect((await replicatedWaitlistEntriesTable.get('wl-1'))?.status).toBe('withdrawn');
  });

  it('does not seed a show this device has not loaded', async () => {
    // No entries of show-1 in the replica: the offer's entry must not become its only row.
    await seed([], [waitingRow('wl-1', 'dog-a', 1)]);

    await promoteWaitlistEntry('wl-1');

    expect(await replicatedEntriesTable.get('entry-new')).toBeNull();
    expect((await replicatedWaitlistEntriesTable.get('wl-1'))?.status).toBe('offered');
  });
});
