import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { YourEntriesTodayCard } from '../YourEntriesTodayCard';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

vi.mock('@/pages/MyEntriesPage/modules/useMyEntriesData', () => ({ useMyEntriesData: vi.fn() }));
vi.mock('@/components/shows/browse/showsPaneGroups', () => ({
  REGROUP_INTERVAL_MS: 60_000,
  showsPaneGroupFor: () => 'today',
}));
vi.mock('@/utils/entryWindowZones', () => ({
  withEntryWindowTimeZones: (shows: unknown[]) => shows,
}));
vi.mock('@/store/showStore');
vi.mock('@/store/trialStore');

function sharedEntries(checkInStatus: EntryClass['checkInStatus'], ...kinds: string[]): MyEntry[] {
  const classes = kinds.map((kind, i) => ({
    id: `e${i}`,
    entryStatusKind: kind,
    name: 'Container Novice A',
    status: 'entered',
    checkInStatus,
  })) as unknown as EntryClass[];
  return [
    {
      id: 'order-1',
      showId: 's1',
      dogs: [{ id: 'd1', dogId: 'dog-1', dogName: 'Scout', classes }],
      classes,
    },
  ] as unknown as MyEntry[];
}

function mockSharedHook(entries: MyEntry[]) {
  (useMyEntriesData as ReturnType<typeof vi.fn>).mockReturnValue({
    entries,
    refreshEntries: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (useShowStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ shows: [{ id: 's1', name: 'Fall Classic' }] })
  );
  (useTrialStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ trials: [] })
  );
});

describe('YourEntriesTodayCard', () => {
  it('renders nothing without an entry in a show happening today', () => {
    mockSharedHook([]);
    render(<YourEntriesTodayCard />);
    expect(screen.queryByText('Your entries today')).not.toBeInTheDocument();
  });

  it('lists the dog, class and status, linking to the entries page with no check-in control', () => {
    mockSharedHook(sharedEntries('no-status', 'accepted'));
    render(<YourEntriesTodayCard />);

    expect(screen.getByText('Your entries today')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Scout, Container Novice A/ });
    expect(link).toHaveAttribute('href', '/exhibitor/entries');
    expect(link).toHaveTextContent('Fall Classic');
    expect(link).toHaveTextContent('Check in');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('re-renders the status when the shared entries change, and words a finished entry as Done', () => {
    mockSharedHook(sharedEntries('no-status', 'accepted'));
    const { rerender } = render(<YourEntriesTodayCard />);
    expect(screen.getByRole('link')).toHaveTextContent('Check in');

    mockSharedHook(sharedEntries('checked-in', 'accepted'));
    rerender(<YourEntriesTodayCard />);
    expect(screen.getByRole('link')).toHaveTextContent('Checked in');

    mockSharedHook(sharedEntries('checked-in', 'completed'));
    rerender(<YourEntriesTodayCard />);
    expect(screen.getByRole('link')).toHaveTextContent('Done');
  });
});
