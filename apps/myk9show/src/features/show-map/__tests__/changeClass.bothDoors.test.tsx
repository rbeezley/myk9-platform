import { createDatabaseError } from '@/services/database/databaseError';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import { EntryListCard } from '@/components/entries/management/EntryListCard';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import ShowDeskPanel from '../ShowDeskPanel';

// MYK9-1614: "Change class" has two doors, the Overview's focused class panel and the entry
// form's row menu. They must be ONE action: same dialog, same rule, same submit.

const mocks = vi.hoisted(() => ({
  getClassesWithCapacity: vi.fn(),
  moveUpShowMapEntry: vi.fn(),
  isOnline: vi.fn(() => true),
  showEntries: [] as unknown[],
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError,
}));
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: mocks.getClassesWithCapacity,
}));
vi.mock('@/services/database/entries/lifecycle', () => ({}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => undefined),
}));
vi.mock('../showMapActionMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('../showMapActionMutations')>()),
  moveUpShowMapEntry: mocks.moveUpShowMapEntry,
}));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => mocks.isOnline(),
}));
vi.mock('@/hooks/queries/useEntriesDatabase', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useEntriesDatabase')>()),
  useSecretaryShowEntriesQuery: () => ({ data: mocks.showEntries }),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    getClassesByTrial: vi.fn(async (trialId: string) =>
      rawClasses.filter(cls => cls.trialId === trialId)
    ),
  },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(async () => [
      {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Saturday Trial 1',
        date: '2026-10-24',
        trialNumber: '1',
      },
    ]),
  },
  replicatedEntriesTable: {
    subscribe: vi.fn(() => () => undefined),
    getEntryById: vi.fn(async () => null),
  },
  replicatedPaperworkPrintsTable: {
    subscribe: vi.fn(() => () => undefined),
    sync: vi.fn(async () => ({ success: true })),
    getByShow: vi.fn(async () => []),
    voidPrint: vi.fn(async () => undefined),
  },
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: (
    selector: (state: {
      getOrCreateThread: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    }) => unknown
  ) => selector({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => ({ ref: { current: null }, width: null }),
}));
vi.mock('@/components/common/CheckInStatusIndicator', () => ({
  CheckInStatusIndicator: () => null,
}));
vi.mock('@/components/entries/EmailStatusIcon', () => ({ EmailStatusIcon: () => null }));

const show = {
  id: 'show-1',
  name: 'ABC October',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-10-24',
  endDate: '2026-10-25',
} as Show;

const trial1 = fromAny<SyncableTrial, unknown>({
  id: 'trial-1',
  showId: 'show-1',
  showName: 'ABC October',
  name: 'Saturday Trial 1',
  trialDate: '2026-10-24',
  trialNumber: '1',
  timezone: 'America/New_York',
  order: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
});

function rawClass(id: string, level: string, section: string, status = 'scheduled') {
  return {
    id,
    trialId: 'trial-1',
    name: `Buried ${level}`,
    element: 'Buried',
    level,
    section,
    classStatus: status,
  };
}
let rawClasses = [rawClass('novice-a', 'Novice', 'A'), rawClass('advanced', 'Advanced', '')];

function panelClasses() {
  return rawClasses.map(cls => ({
    ...cls,
    status: cls.classStatus,
    time: '9:00 AM',
    trialDate: '2026-10-24',
    trialNumber: '1',
    trialName: 'Saturday Trial 1',
  }));
}

const showEntryRow = {
  id: 'entry-1',
  class_id: 'novice-a',
  show_id: 'show-1',
  armband: '101',
  entry_status: 'confirmed',
  check_in_status: 'none',
  dog: { id: 'dog-1', call_name: 'Rex', name: 'Rex' },
};

function makeFormEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Rex',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@test.com',
    handlerName: 'Jane Smith',
    classes: [
      {
        id: 'entry-1',
        classId: 'novice-a',
        name: 'Buried Novice A',
        number: '101',
        fee: 25,
        status: 'entered',
        checkInStatus: 'no-status' as never,
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    rawEntryStatus: 'confirmed',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

const cardProps = {
  onStatusChange: vi.fn(),
  onCheckInStatusChange: vi.fn(),
  onOpenArmbandDialog: vi.fn(),
  onEntryRemoved: vi.fn(),
};

function capacityRows() {
  return rawClasses.map(cls => ({
    id: cls.id,
    name: cls.name,
    class_number: null,
    max_entries: null,
    trial_id: cls.trialId,
    accepted_count: 0,
    available_spots: 999,
    element: cls.element,
    level: cls.level,
    section: cls.section,
  }));
}

async function chooseAdvancedAndConfirm(user: ReturnType<typeof render>['user']) {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).queryByText(/Checking class capacity/)).toBeNull());
  await user.click(within(dialog).getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: /Buried Advanced/ }));
  await user.click(within(dialog).getByRole('button', { name: 'Change class' }));
}

const EXPECTED_SUBMIT = {
  entryId: 'entry-1',
  targetClassId: 'advanced',
  reason: undefined,
  anyOpenClass: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOnline.mockReturnValue(true);
  mocks.showEntries = [showEntryRow];
  rawClasses = [rawClass('novice-a', 'Novice', 'A'), rawClass('advanced', 'Advanced', '')];
  mocks.getClassesWithCapacity.mockImplementation(async () => ({
    data: capacityRows(),
    error: null,
  }));
  mocks.moveUpShowMapEntry.mockResolvedValue({
    originalEntryId: 'entry-1',
    newEntryId: 'entry-9',
    targetClassName: 'Buried Advanced',
  });
});

describe('Change class: two doors, one action (MYK9-1614)', () => {
  it('the Overview class panel submits through moveUpShowMapEntry', async () => {
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial1]}
        classes={panelClasses()}
        entries={[showEntryRow] as never}
        canManageShow
        scopeNow={new Date('2026-10-24T14:00:00.000Z')}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );
    const [firstMatch] = await screen.findAllByText(/Buried Novice/);
    await user.click(firstMatch!);
    await user.click(await screen.findByRole('button', { name: /Change class/ }));
    await chooseAdvancedAndConfirm(user);

    await waitFor(() => expect(mocks.moveUpShowMapEntry).toHaveBeenCalledWith(EXPECTED_SUBMIT));
  });

  it('the entry form row menu submits through the same moveUpShowMapEntry call', async () => {
    const { user } = render(<EntryListCard {...cardProps} entries={[makeFormEntry()]} />);
    await user.click(screen.getByRole('button', { name: /Actions for Rex/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Change class/ }));
    await chooseAdvancedAndConfirm(user);

    await waitFor(() => expect(mocks.moveUpShowMapEntry).toHaveBeenCalledWith(EXPECTED_SUBMIT));
    expect(mocks.moveUpShowMapEntry).toHaveBeenCalledTimes(1);
  });

  it('lists the dog’s own-trial classes and leaves out the class it is already in', async () => {
    const { user } = render(<EntryListCard {...cardProps} entries={[makeFormEntry()]} />);
    await user.click(screen.getByRole('button', { name: /Actions for Rex/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Change class/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).queryByText(/Checking class capacity/)).toBeNull());
    await user.click(within(dialog).getByRole('combobox'));
    const text = (await screen.findAllByRole('option')).map(option => option.textContent ?? '');
    expect(text).toHaveLength(1);
    expect(text[0]).toContain('Buried Advanced');
  });
});

async function openMenu(entry: EntryManagementEntry) {
  const { user } = render(<EntryListCard {...cardProps} entries={[entry]} />);
  await user.click(screen.getByRole('button', { name: /Actions for Rex/ }));
  return screen.findByRole('menuitem', { name: /Change class/ });
}

describe('entry form Change class eligibility (MYK9-1614)', () => {
  it('is enabled for an accepted entry in a class that has not started', async () => {
    const item = await openMenu(makeFormEntry());
    await waitFor(() => expect(item).not.toHaveAttribute('data-disabled'));
  });

  it('is disabled with the reason once the class has started', async () => {
    rawClasses = [
      rawClass('novice-a', 'Novice', 'A', 'In Progress'),
      rawClass('advanced', 'Advanced', ''),
    ];
    const item = await openMenu(makeFormEntry());
    await waitFor(() => expect(item).toHaveAttribute('data-disabled'));
    expect(item).toHaveTextContent('Its class has already started.');
  });

  it('is disabled with the reason for an entry that has already run', async () => {
    const item = await openMenu(makeFormEntry({ isScored: true }));
    await waitFor(() => expect(item).toHaveAttribute('data-disabled'));
    expect(item).toHaveTextContent('This entry has already run.');
  });

  it('is disabled with the reason for a pending entry', async () => {
    const item = await openMenu(makeFormEntry({ rawEntryStatus: 'pending' }));
    await waitFor(() => expect(item).toHaveAttribute('data-disabled'));
    expect(item).toHaveTextContent('Accept this entry first.');
  });

  it('is disabled with the reason when offline (the move is an online-only RPC)', async () => {
    mocks.isOnline.mockReturnValue(false);
    const item = await openMenu(makeFormEntry());
    await waitFor(() => expect(item).toHaveAttribute('data-disabled'));
    expect(item).toHaveTextContent('Changing a class needs a connection.');
  });
});
