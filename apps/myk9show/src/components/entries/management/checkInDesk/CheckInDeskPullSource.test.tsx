/**
 * MYK9-1757: the Check-in desk says WHO flagged a pull, read from the SAME replicated row as the
 * flag itself. Every hop starts from the replication VIEW row key (`check_in_pulled_by`), so a
 * projection that drops the column anywhere between the view and the card turns this red.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { createAppQueryClient } from '@/lib/queryClient';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { CheckInStatus } from '@myk9/core';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { toSecretaryEntry } from '@/services/database/entries/secretaryReadReplication';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import { CheckInDesk } from './CheckInDesk';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/database/entries/flaggedPull', () => ({ clearFlaggedPull: vi.fn() }));
vi.mock('@/services/show-day/checkInStatus', () => ({ updateReplicatedCheckInStatus: vi.fn() }));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => ({
    readPending: false,
    readFailed: false,
    retry: vi.fn(),
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Trial 1',
        trialNumber: '1',
        trialDate: '2026-07-08',
        timezone: 'America/New_York',
      },
    ],
    trialClasses: {
      'trial-1': [
        { id: 'class-1', element: 'Container', level: 'Novice', section: 'A', startTime: '09:00' },
      ],
    },
  }),
}));

const NOW = new Date('2026-07-08T16:00:00.000Z');
const FLAGGED = 'Flagged as pulled.';
const EXHIBITOR = 'The exhibitor flagged this pull.';
const STAFF = 'Ringside staff flagged this pull.';

const deskProps = {
  showId: 'show-1',
  loading: false,
  unknown: false,
  onRetry: vi.fn(),
  currentDate: NOW,
};

function poppy(checkInPulledBy?: string | null): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Poppy',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    handlerId: 'person-1',
    ownerId: 'person-1',
    classes: [
      {
        id: 'entry-1',
        classId: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
        checkInStatus: 'pulled',
        ...(checkInPulledBy === undefined ? {} : { checkInPulledBy }),
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: NOW,
    lastUpdated: NOW,
    armbandNumber: '114',
  };
}

describe('the flagged-pull line names who flagged it (MYK9-1757)', () => {
  it.each([
    ['exhibitor', EXHIBITOR],
    ['staff', STAFF],
    [null, FLAGGED],
    [undefined, FLAGGED],
    ['something-new', FLAGGED],
  ])('source %s reads "%s"', (source, line) => {
    render(<CheckInDesk {...deskProps} entries={[poppy(source)]} />);

    const card = screen.getByRole('article', { name: 'Poppy' });
    expect(within(card).getByText(new RegExp(`^${line.replace('.', '\\.')}`))).toBeVisible();
    // The guidance and both actions are unchanged.
    expect(within(card).getByText(/Confirm it to pull the entry, or clear it\./)).toBeVisible();
    expect(within(card).getByRole('button', { name: /^Clear the pull flag/ })).toBeEnabled();
    expect(within(card).getByRole('button', { name: /^Confirm the pull/ })).toBeEnabled();
  });
});

/** A row of view_authenticated_entry_results_replication as the sync delivers it. */
function viewRow(checkInStatus: CheckInStatus, source: string | null): EntryRow {
  return {
    id: 'entry-1',
    show_id: 'show-1',
    class_id: 'class-1',
    dog_id: 'dog-1',
    handler_id: 'person-1',
    registration_id: 'reg-1',
    entry_status: 'confirmed',
    payment_status: 'paid',
    entry_fee: 25,
    armband: '114',
    check_in_status: checkInStatus,
    check_in_pulled_by: source,
  } as unknown as EntryRow;
}

/** The real hops from a replicated row to the desk's entry: mapper, desk read model, hook map. */
function projectToDeskEntry(row: EntryRow): EntryManagementEntry {
  const secretary = toSecretaryEntry(rowToEntry(row), {
    dogsMap: new Map([
      ['dog-1', { id: 'dog-1', name: 'Poppy', ownerId: 'person-1' } as unknown as ReplicatedDog],
    ]),
    classesMap: new Map([
      [
        'class-1',
        {
          id: 'class-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
        } as unknown as ReplicatedClass,
      ],
    ]),
    armbandsByEntryId: new Map(),
    armbandsByDogId: new Map(),
    peopleMap: new Map(),
    enrollmentsMap: new Map(),
    trialsMap: new Map(),
    pullMetadataMap: new Map(),
  });
  return mapSecretaryEntryToEntryManagementEntry(secretary);
}

describe('the source rides the replicated row to the desk', () => {
  it('survives every hop from the view column to the class the card reads', () => {
    expect(projectToDeskEntry(viewRow('pulled', 'exhibitor')).classes[0]?.checkInPulledBy).toBe(
      'exhibitor'
    );
    expect(projectToDeskEntry(viewRow('pulled', 'staff')).classes[0]?.checkInPulledBy).toBe(
      'staff'
    );
    // A row from before the migration has no column at all: unknown, never a guess.
    const old = { ...viewRow('pulled', null) } as Record<string, unknown>;
    delete old.check_in_pulled_by;
    expect(projectToDeskEntry(old as unknown as EntryRow).classes[0]?.checkInPulledBy).toBeNull();
  });
});

describe('a re-flag after a Clear is credited to the new flagger (createAppQueryClient)', () => {
  let server: EntryRow;

  /** The desk's entries as production holds them: a React Query read on the app's own client. */
  function DeskOnReplica() {
    const { data } = useQuery({
      queryKey: ['entries', 'show-1', 'desk'],
      queryFn: async () => [projectToDeskEntry(server)],
    });
    return <CheckInDesk {...deskProps} entries={data ?? []} loading={data === undefined} />;
  }

  function Reread() {
    const client = useQueryClient();
    return (
      <button type="button" onClick={() => void client.invalidateQueries()}>
        reread
      </button>
    );
  }

  async function reread(user: ReturnType<typeof render>['user']) {
    await user.click(screen.getByRole('button', { name: 'reread' }));
  }

  beforeEach(() => {
    server = viewRow('pulled', 'exhibitor');
  });

  it('credits the exhibitor, then nobody after the Clear, then staff after the re-flag', async () => {
    const queryClient: QueryClient = createAppQueryClient();
    const { user } = render(
      <>
        <DeskOnReplica />
        <Reread />
      </>,
      { queryClient }
    );

    // Positive control: the first flag is the exhibitor's.
    expect(await screen.findByText(new RegExp(`^${EXHIBITOR}`))).toBeVisible();

    // The secretary clears it: the server row is no longer pulled and holds no source.
    server = viewRow('checked-in', null);
    await reread(user);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Clear the pull flag/ })).not.toBeInTheDocument()
    );

    // Ringside staff flag it again.
    server = viewRow('pulled', 'staff');
    await reread(user);
    expect(await screen.findByText(new RegExp(`^${STAFF}`))).toBeVisible();
    expect(screen.queryByText(new RegExp(EXHIBITOR))).not.toBeInTheDocument();

    // And the other way round: Clear, then the exhibitor re-flags.
    server = viewRow('checked-in', null);
    await reread(user);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Clear the pull flag/ })).not.toBeInTheDocument()
    );
    server = viewRow('pulled', 'exhibitor');
    await reread(user);
    expect(await screen.findByText(new RegExp(`^${EXHIBITOR}`))).toBeVisible();
    expect(screen.queryByText(new RegExp(STAFF))).not.toBeInTheDocument();
  });
});
