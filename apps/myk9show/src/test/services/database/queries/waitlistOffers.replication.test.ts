/**
 * MYK9-1001: the Waitlist tab's Offered group reads open offers from the same replica rows as
 * the queue, and the class counts carry an offered count so a class whose only dog was offered
 * is still read.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';

const t = vi.hoisted(() => ({
  waitlist: { getByClass: vi.fn(), getAll: vi.fn(), getAllOrThrow: vi.fn() },
  trials: { getTrialsByShow: vi.fn(), getTrialById: vi.fn() },
  classes: { getClassesByTrial: vi.fn(), getClassById: vi.fn() },
  dogs: { getDogById: vi.fn() },
  entries: { getEntryById: vi.fn(), getAllOrThrow: vi.fn() },
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: t.waitlist,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: t.trials,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: t.classes,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({ replicatedDogsTable: t.dogs }));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: t.entries,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import {
  getClassesWithWaitlistCounts,
  getWaitlistOffersByClass,
} from '@/services/database/waitlists';

const row = (over: Partial<ReplicatedWaitlistEntry>): ReplicatedWaitlistEntry => ({
  id: 'wl-1',
  classId: 'class-1',
  dogId: 'dog-1',
  exhibitorId: 'ex-1',
  position: 1,
  status: 'waiting',
  ...over,
});

describe('getWaitlistOffersByClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    t.classes.getClassById.mockResolvedValue({
      id: 'class-1',
      name: 'raw name',
      element: 'Interior',
      level: 'Novice',
      trialId: 'trial-1',
      maxEntries: 10,
    });
    t.trials.getTrialById.mockResolvedValue({
      id: 'trial-1',
      showId: 'show-1',
      name: 'Saturday Trial',
      date: '2026-10-10',
      timezone: 'America/Denver',
    });
    t.dogs.getDogById.mockImplementation(async (id: string) => ({
      id,
      name: id === 'dog-2' ? 'Bolt' : 'Rex',
      callName: id === 'dog-2' ? 'Bolt' : 'Rex',
    }));
  });

  it('returns only open offers, oldest first, with the trial zone, the shown class name and the payment state', async () => {
    t.waitlist.getByClass.mockResolvedValue([
      row({ id: 'wl-wait', status: 'waiting' }),
      row({ id: 'wl-gone', status: 'withdrawn' }),
      row({
        id: 'wl-late',
        dogId: 'dog-2',
        status: 'offered',
        offeredAt: '2026-10-05T12:00:00Z',
        offerExpiresAt: '2026-10-07T12:00:00Z',
        promotedEntryId: 'entry-paid',
      }),
      row({
        id: 'wl-early',
        status: 'offered',
        offeredAt: '2026-10-04T12:00:00Z',
        offerExpiresAt: '2026-10-06T12:00:00Z',
        promotedEntryId: 'entry-pending',
      }),
    ]);
    t.entries.getEntryById.mockImplementation(async (id: string) => ({
      id,
      paymentStatus: id === 'entry-paid' ? 'paid' : 'pending',
    }));

    const { data, error } = await getWaitlistOffersByClass('class-1');

    expect(error).toBeNull();
    expect(
      data.map(o => [
        o.id,
        o.dog?.call_name,
        o.class?.name,
        o.trial_timezone,
        o.promoted_entry_paid,
      ])
    ).toEqual([
      ['wl-early', 'Rex', 'Interior Novice', 'America/Denver', false],
      ['wl-late', 'Bolt', 'Interior Novice', 'America/Denver', true],
    ]);
    expect(t.entries.getEntryById).toHaveBeenCalledWith('entry-paid');
    // Which trial: shows repeat a class across trials (Codex P2 on #2772).
    expect(data.map(o => [o.trial_name, o.trial_date])).toEqual([
      ['Saturday Trial', '2026-10-10'],
      ['Saturday Trial', '2026-10-10'],
    ]);
  });

  it('reads nothing else when the class has no open offer', async () => {
    t.waitlist.getByClass.mockResolvedValue([row({ status: 'waiting' })]);
    const { data, error } = await getWaitlistOffersByClass('class-1');
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(t.classes.getClassById).not.toHaveBeenCalled();
  });

  it('reports a replica failure as an error, never as no offers', async () => {
    t.waitlist.getByClass.mockRejectedValue(new Error('replica unavailable'));
    const { data, error } = await getWaitlistOffersByClass('class-1');
    expect(data).toEqual([]);
    expect(error).not.toBeNull();
  });
});

describe('getClassesWithWaitlistCounts offered count', () => {
  it('counts open offers apart from waiting dogs, so a class whose only dog was offered is still read', async () => {
    t.trials.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', showId: 'show-1', timezone: 'America/Chicago' },
    ]);
    t.classes.getClassesByTrial.mockResolvedValue([
      { id: 'class-1', name: 'Novice', trialId: 'trial-1' },
    ]);
    t.entries.getAllOrThrow.mockResolvedValue([]);
    t.waitlist.getAllOrThrow.mockResolvedValue([
      row({ id: 'a', status: 'offered' }),
      row({ id: 'b', status: 'withdrawn' }),
      row({ id: 'c', status: 'expired' }),
    ]);

    const { data } = await getClassesWithWaitlistCounts('show-1');

    expect(data[0]).toMatchObject({
      waitlist_count: 0,
      offered_count: 1,
      trial: { timezone: 'America/Chicago' },
    });
  });
});
