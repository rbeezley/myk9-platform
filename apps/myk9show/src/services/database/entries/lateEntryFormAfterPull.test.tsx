/**
 * MYK9-1930: once the show's entries pull brings back the form the server gave a desk late
 * entry, the Entries page's read carries the form id, re-reads that form's money from
 * `enrollments` (`loadSecretaryEnrollmentsMap`), and the group offers the form's existing
 * Cash / Check controls. Before the pull, the same row reads as saved on this device only.
 * This runs the real warm read (`getReplicatedSecretaryEntriesForShow`) and the real mapper,
 * grouping and card; only the replica and the network are stand-ins.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

const mocks = vi.hoisted(() => ({
  entries: [] as Record<string, unknown>[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  inCalls: [] as Array<{ table: string; ids: unknown }>,
}));

vi.mock('../supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('../supabaseClient')>()),
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: async (_column: string, ids: unknown) => {
          mocks.inCalls.push({ table, ids });
          return { data: mocks.rows[table] ?? [], error: null };
        },
      }),
    }),
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedEntriesTable')>()),
  replicatedEntriesTable: {
    getEntriesByShow: async () => mocks.entries,
    getSyncMetadata: async () => ({ totalRows: mocks.entries.length }),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedDogsTable')>()),
  replicatedDogsTable: {
    getAllDogs: async () => [{ id: 'dog-1', name: 'Pepper', ownerId: 'owner-1' }],
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedClassesTable')>()),
  replicatedClassesTable: {
    getAllOrThrow: async () => [{ id: 'class-1', name: 'Interior Novice A' }],
    subscribe: () => () => undefined,
  },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedArmbandsTable')>()),
  replicatedArmbandsTable: { getByShow: async () => [] },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/ReplicatedTrialsTable')>()),
  replicatedTrialsTable: { getTrialsByShow: async () => [] },
}));
vi.mock('@/services/replication/entriesShowSyncState', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/entriesShowSyncState')>()),
  assertShowEntriesNotForeign: async () => undefined,
}));
vi.mock('./handlerHydration', async importOriginal => ({
  ...(await importOriginal<typeof import('./handlerHydration')>()),
  loadHandlerPeople: async () => new Map(),
}));
vi.mock('./secretaryPostgrest', async importOriginal => ({
  ...(await importOriginal<typeof import('./secretaryPostgrest')>()),
  postgrestGetSecretaryPullMetadataMap: async () => new Map(),
}));

vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: ({ status }: { status: string }) => <span>{status}</span>,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import { groupEntriesByEnrollment } from '@/utils/enrollmentGrouping';
import { EnrollmentCard } from '@/components/entries/management/EnrollmentCard';
import { SAVED_ON_DEVICE_PAYMENT_NOTE } from '@/components/entries/management/enrollmentPayment';

const lateEntry = {
  id: 'late-1',
  dogId: 'dog-1',
  classId: 'class-1',
  showId: 'show-1',
  handlerId: 'owner-1',
  handler: 'Dana Reyes',
  entryStatus: 'confirmed',
  entryFee: 35,
  paymentStatus: 'pending',
  paymentMethod: 'cash',
  submittedAt: '2026-11-18T15:00:00Z',
};

const form = {
  id: 'form-1',
  confirmation_number: 'MK9-001930',
  payment_status: 'pending',
  payment_reference: null,
  total_amount: 3500,
  paid_amount: 0,
  card_covered_cents: 0,
  handler_id: 'owner-1',
  refund_amount: null,
  refund_notes: null,
  refunded_at: null,
};

async function readGroup() {
  const { data } = await getReplicatedSecretaryEntriesForShow('show-1');
  const groups = groupEntriesByEnrollment(
    data.map(entry => mapSecretaryEntryToEntryManagementEntry(entry, null))
  );
  expect(groups).toHaveLength(1);
  return { row: data[0]!, group: groups[0]! };
}

function renderCard(group: Awaited<ReturnType<typeof readGroup>>['group']) {
  render(
    <EnrollmentCard
      group={group}
      onStatusChange={vi.fn()}
      onCheckInStatusChange={vi.fn()}
      onOpenArmbandDialog={vi.fn()}
      onEntryRemoved={vi.fn()}
      paymentLedger={{
        record: vi.fn().mockResolvedValue('saved'),
        markPaidOnline: vi.fn().mockResolvedValue(true),
        todayInShowZone: '2026-11-18',
      }}
    />
  );
}

beforeEach(() => {
  mocks.inCalls.length = 0;
  mocks.rows = { people: [], enrollments: [form] };
});

describe('a desk late entry after the show’s entries pull (MYK9-1930)', () => {
  it('before the pull: no form to read, and the card says so', async () => {
    mocks.entries = [{ ...lateEntry, _localOnly: true }];

    const { row, group } = await readGroup();

    expect(row.registration_id).toBeNull();
    expect(row.saved_on_device_only).toBe(true);
    expect(mocks.inCalls.some(call => call.table === 'enrollments')).toBe(false);
    expect(group.enrollmentId).toBeNull();
    renderCard(group);
    expect(screen.getByText(SAVED_ON_DEVICE_PAYMENT_NOTE)).toBeInTheDocument();
  });

  it('after the pull: the form id is on the row, its money is read, and Cash / Check are there', async () => {
    mocks.entries = [{ ...lateEntry, registrationId: 'form-1' }];

    const { row, group } = await readGroup();

    expect(row.registration_id).toBe('form-1');
    expect(mocks.inCalls).toContainEqual({ table: 'enrollments', ids: ['form-1'] });
    expect(row.registration).toEqual(
      expect.objectContaining({ id: 'form-1', total_amount: 3500, paid_amount: 0 })
    );
    expect(group.enrollmentId).toBe('form-1');
    renderCard(group);
    expect(screen.queryByText(SAVED_ON_DEVICE_PAYMENT_NOTE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change payment' }));
    expect(screen.getByText('Paid in Full: Cash…')).toBeInTheDocument();
    expect(screen.getByText('Paid in Full: Check…')).toBeInTheDocument();
  });
});
