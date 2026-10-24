import { createDatabaseError } from '@/services/database/databaseError';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import ShowDeskPanel from '../ShowDeskPanel';

// MYK9-1265: Change class from the Overview offered an empty dropdown. This drives the
// real Overview path (focus a class, press Change class on an entry) on the real class shape.

const mockGetClassesWithCapacity = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError,
}));
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: mockGetClassesWithCapacity,
}));
vi.mock('@/services/database/entries/lifecycle', () => ({
  restoreEntryStatus: vi.fn(),
}));
vi.mock('@/features/show-live-sync/showChangeSignal', () => ({
  subscribeToShowChanges: vi.fn(() => () => undefined),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn(), subscribe: vi.fn(() => () => undefined) },
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

const show = {
  id: 'show-1',
  name: 'ABC October',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-10-24',
  endDate: '2026-10-25',
} as Show;

function makeTrial(id: string, trialDate: string, trialNumber: string) {
  return fromAny<SyncableTrial, unknown>({
    id,
    showId: 'show-1',
    showName: 'ABC October',
    name: `Trial ${trialNumber}`,
    trialDate,
    trialNumber,
    timezone: 'America/New_York',
    order: trialNumber,
    status: 'In Progress',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  });
}
const trial1 = makeTrial('trial-1', '2026-10-24', '1');
const trial2 = makeTrial('trial-2', '2026-10-25', '2');

function makeClass(
  id: string,
  trialId: string,
  element: string,
  level: string,
  section: string,
  status = 'scheduled'
) {
  return {
    id,
    trialId,
    name: `${element} ${level}`,
    element,
    level,
    section,
    status,
    time: '9:00 AM',
    trialDate: trialId === 'trial-1' ? '2026-10-24' : '2026-10-25',
    trialNumber: trialId === 'trial-1' ? '1' : '2',
    trialName: trialId === 'trial-1' ? 'Saturday Trial 1' : 'Saturday Trial 2',
  };
}

const noviceA = makeClass('novice-a', 'trial-1', 'Buried', 'Novice', 'A');
const classes = [
  noviceA,
  makeClass('advanced', 'trial-1', 'Buried', 'Advanced', ''),
  makeClass('excellent', 'trial-1', 'Buried', 'Excellent', ''),
  makeClass('master', 'trial-1', 'Buried', 'Master', ''),
  makeClass('container-novice', 'trial-1', 'Container', 'Novice', 'A'),
  makeClass('buried-novice-t2', 'trial-2', 'Buried', 'Novice', 'A'),
  makeClass('interior-done', 'trial-2', 'Interior', 'Master', '', 'completed'),
];

const baseEntries = [
  {
    id: 'entry-1',
    class_id: 'novice-a',
    show_id: 'show-1',
    armband: '101',
    entry_status: 'confirmed',
    check_in_status: 'none',
    dog: { id: 'dog-1', call_name: 'Rex', name: 'Rex' },
  },
];

type PanelEntries = Parameters<typeof ShowDeskPanel>[0]['entries'];
const entries = baseEntries as unknown as PanelEntries;
// The same dog also holds a live entry in Advanced and a withdrawn one in Excellent.
const entriesWithOtherClasses = [
  ...baseEntries,
  { ...baseEntries[0]!, id: 'entry-2', class_id: 'advanced' },
  { ...baseEntries[0]!, id: 'entry-3', class_id: 'excellent', entry_status: 'withdrawn' },
] as unknown as PanelEntries;

function capacityRows() {
  return classes.map(cls => ({
    id: cls.id,
    name: cls.name,
    class_number: null,
    max_entries: null,
    trial_id: cls.trialId,
    accepted_count: 0,
    available_spots: cls.id === 'master' ? 0 : 999,
    element: cls.element,
    level: cls.level,
    section: cls.section,
  }));
}

async function openChangeClass(panelEntries: PanelEntries = entries) {
  mockGetClassesWithCapacity.mockResolvedValue({ data: capacityRows(), error: null });
  const { user } = render(
    <ShowDeskPanel
      show={show}
      trials={[trial1, trial2]}
      classes={classes}
      entries={panelEntries}
      canManageShow
      scopeNow={new Date('2026-10-24T14:00:00.000Z')}
    />,
    { initialRoute: '/shows/show-1/show-day' }
  );
  const [firstMatch] = await screen.findAllByText(/Buried Novice/);
  await user.click(firstMatch!);
  await user.click(await screen.findByRole('button', { name: /Change class/ }));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).queryByText(/Checking class capacity/)).toBeNull());
  await user.click(within(dialog).getByRole('combobox'));
  return dialog;
}

describe('Overview Change class current class (MYK9-1385)', () => {
  it('prints the section when the stored class name lacks it, as the class page does', async () => {
    // `makeClass` stores the name "Buried Novice" for element Buried, level Novice, section A.
    const dialog = await openChangeClass();
    expect(within(dialog).getByText('Current class: Buried Novice A')).toBeInTheDocument();
  });
});

describe('Overview Change class (MYK9-1265)', () => {
  it('lists every not-complete class in every trial, disabling a full one', async () => {
    await openChangeClass();
    const options = await screen.findAllByRole('option');
    const text = options.map(option => option.textContent ?? '');
    expect(text.some(t => t.includes('Buried Advanced'))).toBe(true);
    expect(text.some(t => t.includes('Buried Excellent'))).toBe(true);
    expect(text.some(t => t.includes('Buried Master') && t.includes('Full'))).toBe(true);
    // Another element and another trial are valid targets now.
    expect(text.some(t => t.includes('Container Novice'))).toBe(true);
    expect(text.some(t => t.includes('Buried Novice') && t.includes('Saturday Trial 2'))).toBe(
      true
    );
    // The class the dog is already in, and a completed class, are not.
    expect(
      text.filter(t => t.includes('Buried Novice A') && !t.includes('Saturday Trial 2'))
    ).toEqual([]);
    expect(text.some(t => t.includes('Interior Master'))).toBe(false);
  });

  it('leaves out a class the dog already holds a live entry in', async () => {
    await openChangeClass(entriesWithOtherClasses);
    const text = (await screen.findAllByRole('option')).map(option => option.textContent ?? '');
    expect(text.some(t => t.includes('Buried Advanced'))).toBe(false);
    // A withdrawn entry does not hold the dog's place.
    expect(text.some(t => t.includes('Buried Excellent'))).toBe(true);
  });

  it('says so when no class is eligible, even while capacity is still loading', async () => {
    mockGetClassesWithCapacity.mockReturnValue(new Promise(() => undefined));
    const { user } = render(
      <ShowDeskPanel
        show={show}
        trials={[trial1]}
        classes={[noviceA]}
        entries={entries}
        canManageShow
        scopeNow={new Date('2026-10-24T14:00:00.000Z')}
      />,
      { initialRoute: '/shows/show-1/show-day' }
    );
    const [firstMatch] = await screen.findAllByText(/Buried Novice/);
    await user.click(firstMatch!);
    await user.click(await screen.findByRole('button', { name: /Change class/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('No other classes are available.')).toBeInTheDocument();
  });
});
