/**
 * Render tests for "Your dogs today" inside a My Shows show group (MYK9-1046).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList, type MyShowsListProps } from './MyShowsList';
import type { MyEntry } from './my-entries-types';

const mocks = vi.hoisted(() => ({
  online: true,
  places: new Map<string, number>(),
  updatedAt: null as number | null,
  conflicts: new Map<string, string>(),
}));

vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => mocks.online,
}));
vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlacesWithFreshness: () => ({
    places: mocks.online ? mocks.places : new Map<string, number>(),
    updatedAt: mocks.online ? mocks.updatedAt : null,
  }),
}));
vi.mock('@/features/at-show/useMyRingConflicts', () => ({
  useMyRingConflicts: () => mocks.conflicts,
}));
vi.mock('./useClassTimings', () => ({
  useClassTimings: () =>
    new Map([
      ['k-early', { label: '9:00 AM', sortMinutes: 540, isRevised: false }],
      ['k-late', { label: '1:00 PM', sortMinutes: 780, isRevised: true }],
    ]),
}));

function twoDogRows(date = '2026-10-24'): MyEntry[] {
  const trialDate = day(date);
  return [
    makeRow({
      id: 'e-juni',
      dogId: 'dog-juni',
      dogName: 'Juni',
      armband: '102',
      classes: [
        makeClass({
          id: 'c-juni',
          classId: 'k-late',
          name: 'Exterior Excellent',
          trialDate,
          runOrder: 1,
          checkInStatus: 'checked-in',
        }),
      ],
    }),
    makeRow({
      id: 'e-willow',
      dogId: 'dog-willow',
      dogName: 'Willow',
      armband: '100',
      classes: [
        makeClass({ id: 'c-willow', classId: 'k-early', name: 'Interior Advanced', trialDate }),
      ],
    }),
  ];
}

function renderRows(rows: MyEntry[], overrides: Partial<MyShowsListProps> = {}) {
  const props: MyShowsListProps = {
    filteredEntries: toOrders(rows),
    source: 'confirmed',
    seenResultReleaseKeys: new Set<string>(),
    now: NOW,
    onCheckInDay: vi.fn(),
    onOpenCheckIn: vi.fn(),
    onOpenEdit: vi.fn(),
    onOpenReceipts: vi.fn(),
    onLeaveClass: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<MyShowsList {...props} />) };
}

beforeEach(() => {
  localStorage.clear();
  mocks.online = true;
  mocks.places = new Map();
  mocks.updatedAt = null;
  mocks.conflicts = new Map();
});

describe('Your dogs today', () => {
  it('lists both dogs in start order, and narrows by dog with honest counts', async () => {
    renderRows(twoDogRows());
    const list = screen.getByTestId('your-dogs-today');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Willow');
    expect(items[1]).toHaveTextContent('Juni');

    expect(within(list).getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
    await userEvent.setup().click(within(list).getByRole('button', { name: 'Juni (1)' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    // Counts describe the day, not the narrowed list.
    expect(within(list).getByRole('button', { name: 'All (2)' })).toBeInTheDocument();
  });

  it('puts a freshness time on every place in line it shows', () => {
    mocks.places = new Map([['c-juni', 3]]);
    mocks.updatedAt = new Date('2026-10-24T17:05:00Z').getTime();
    renderRows(twoDogRows());
    const place = within(screen.getByTestId('your-dogs-today')).getByTestId(
      'your-dogs-today-place'
    );
    expect(place).toHaveTextContent(/3/);
    expect(place).toHaveTextContent(/updated 12:05 PM/);
  });

  it('flags two dogs due at once in words', () => {
    mocks.conflicts = new Map([['c-juni', 'Willow next in Interior Advanced']]);
    renderRows(twoDogRows());
    expect(screen.getByText(/Two of your dogs are due at the same time/)).toHaveTextContent(
      'Willow next in Interior Advanced'
    );
  });

  it('says the list may be out of date when serving saved data offline', () => {
    mocks.online = false;
    renderRows(twoDogRows(), { source: 'replica-offline' });
    expect(within(screen.getByTestId('your-dogs-today')).getByRole('status')).toHaveTextContent(
      /may be out of date/
    );
    // A stale number is worse than none: offline the row says Waiting, no place.
    expect(screen.getByTestId('your-dogs-today-place')).toHaveTextContent(/^Waiting$/);
  });

  it('is not shown off show day, so My Shows is unchanged', () => {
    renderRows(twoDogRows('2026-10-25'));
    expect(screen.queryByTestId('your-dogs-today')).toBeNull();
    expect(screen.getByText('Juni')).toBeInTheDocument();
  });

  it('is not shown for a single dog', () => {
    renderRows(twoDogRows().slice(0, 1));
    expect(screen.queryByTestId('your-dogs-today')).toBeNull();
  });
});
