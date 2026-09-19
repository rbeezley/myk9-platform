/**
 * MYK9-659: the order's reference must be the SAME string online and offline.
 *
 * The receipt prints `Confirmation #` when the order has a confirmation number
 * and a labelled `Reference` otherwise. `enrollments.confirmation_number` is
 * NOT NULL and `submit_show_entries` always links one, so every order the app
 * creates owns that reference — but it reached the client only through the
 * PostgREST embed `registration:registration_id(confirmation_number)`. The
 * replica path cannot make that embed: it attempts a best-effort `enrollments`
 * fetch, which on the dead show-day network that put it on the replica in the
 * first place returns nothing. The same order therefore printed
 * `Confirmation #: MK9-000146` online and a raw enrollment UUID offline.
 *
 * Migration 20260919130100 carries the number on the replication view; these
 * tests pin that `buildReplicatedUserEntryRows` puts it where the mapper reads
 * it, with and without the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectMock,
    })),
  },
}));

import { buildReplicatedUserEntryRows } from './userEntriesReplication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const ENROLLMENT_ID = 'cdc232e8-6d0a-408b-8e14-2f4be11adc36';
const CONFIRMATION_NUMBER = 'MK9-000146';

/** A mail-in order's class row, as the replication store holds it. */
function replicatedRow(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    dogId: 'dog-juni',
    classId: 'class-1',
    showId: 'show-1',
    handlerId: 'person-1',
    entryStatus: 'submitted',
    paymentStatus: 'paid',
    registrationId: ENROLLMENT_ID,
    registrationConfirmationNumber: CONFIRMATION_NUMBER,
    ...overrides,
  } as ReplicatedEntry;
}

const emptyMaps = {
  dogsMap: new Map(),
  classesMap: new Map(),
  showsMap: new Map(),
  trialsMap: new Map(),
};

/** The `enrollments` enrichment fetch, resolved with whatever `rows` says. */
function enrollmentFetchResolves(rows: unknown[] | null) {
  selectMock.mockReturnValue({
    in: vi.fn(() => ({
      abortSignal: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    })),
  });
}

/** The same fetch on a dead network: it rejects, as it does offline. */
function enrollmentFetchRejects() {
  selectMock.mockReturnValue({
    in: vi.fn(() => ({
      abortSignal: vi.fn(() => Promise.reject(new Error('Failed to fetch'))),
    })),
  });
}

describe('MYK9-659 — the replicated order carries its own confirmation number', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('serves the replicated confirmation number when the enrollment fetch fails offline', async () => {
    enrollmentFetchRejects();

    const { data } = await buildReplicatedUserEntryRows([replicatedRow()], emptyMaps);

    expect(data).toHaveLength(1);
    expect(data[0]!.registration).toEqual(
      expect.objectContaining({ confirmation_number: CONFIRMATION_NUMBER })
    );
  });

  it('serves it when the enrollment fetch succeeds but returns no matching row', async () => {
    enrollmentFetchResolves([]);

    const { data } = await buildReplicatedUserEntryRows([replicatedRow()], emptyMaps);

    expect(data[0]!.registration).toEqual(
      expect.objectContaining({ confirmation_number: CONFIRMATION_NUMBER })
    );
  });

  it('prefers the live enrollment row, which carries payment fields the replica has not', async () => {
    enrollmentFetchResolves([
      {
        id: ENROLLMENT_ID,
        confirmation_number: CONFIRMATION_NUMBER,
        payment_status: 'paid',
        payment_reference: 'check 1042',
        paid_amount: 50,
      },
    ]);

    const { data } = await buildReplicatedUserEntryRows([replicatedRow()], emptyMaps);

    expect(data[0]!.registration).toEqual(
      expect.objectContaining({
        confirmation_number: CONFIRMATION_NUMBER,
        payment_reference: 'check 1042',
      })
    );
  });

  it('leaves registration absent when the row genuinely has no order', async () => {
    enrollmentFetchResolves([]);

    const { data } = await buildReplicatedUserEntryRows(
      [
        replicatedRow({
          registrationId: undefined,
          registrationConfirmationNumber: undefined,
        } as Partial<ReplicatedEntry>),
      ],
      emptyMaps
    );

    expect(data[0]!.registration).toBeUndefined();
  });

  it('leaves it absent before migration 20260919130100 is pushed', async () => {
    // A replica row cached from a view that does not yet return the column.
    // The receipt then prints NO reference — the pinned MYK9-631 behaviour —
    // never a raw enrollment UUID.
    enrollmentFetchRejects();

    const { data } = await buildReplicatedUserEntryRows(
      [replicatedRow({ registrationConfirmationNumber: undefined } as Partial<ReplicatedEntry>)],
      emptyMaps
    );

    expect(data[0]!.registration).toBeUndefined();
  });
});
