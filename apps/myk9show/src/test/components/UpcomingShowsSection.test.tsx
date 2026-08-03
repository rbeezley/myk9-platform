import { screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import UpcomingShowsSection from '@/components/dogs/DogDetails/Competitions/UpcomingShows/UpcomingShowsSection';
import ActivityTab from '@/components/dogs/DogDetailsMain/ActivityTab';
import { useCompetitionStore } from '@/store/competitionStore';

// MYK9-121: Career -> Competitions -> Upcoming Shows used to read a client-only
// Zustand store that no code path ever populated, so it rendered "No Upcoming
// Shows" for every dog while the Overview activity card listed real entries off
// `useEntriesByDogQuery`. These tests mock that query — the ONE canonical
// dog-scoped read — and drive the real chain through `useDogActivity` and
// `deriveDogActivity` into both components, so a surface that stops composing
// the canonical query fails here rather than silently disagreeing again.

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

// Mock PremiumButton to avoid @myk9/ui resolution issue
vi.mock('@/components/common/PremiumButton', () => ({
  PremiumButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Mock IconContainer
vi.mock('@/components/common/IconContainer', () => ({
  IconContainer: () => <div data-testid="icon-container" />,
}));

// Mock dialog components to keep tests focused
vi.mock('@/components/dogs/DogDetails/Competitions/UpcomingShows/AddExternalShowDialog', () => ({
  default: () => <div data-testid="add-dialog" />,
}));

vi.mock('@/components/dogs/DogDetails/Competitions/UpcomingShows/ShowDetailsDialog', () => ({
  default: () => <div data-testid="show-details-dialog" />,
}));

vi.mock('@/components/common/StandardDialog', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="standard-dialog">{children}</div>
  ),
}));

vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <div data-testid="three-dot-menu" />,
}));

vi.mock('@/components/common/SectionCard', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="section-card">{children}</div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const DOG_ID = 'dog-willow';
const FUTURE = '2099-08-01';
const LATER = '2099-09-14';

/** A row shaped the way `getEntriesByDog` actually returns one. */
function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    entry_status: 'submitted',
    result_status: null,
    is_scored: false,
    show: { id: 'show-1', name: 'Heartland Scent Work Classic', start_date: FUTURE },
    class: { id: 'class-1', name: 'Container Novice A' },
    ...overrides,
  };
}

/**
 * `useEntriesByDogQuery` reports read provenance alongside the rows.
 * `verified: false` models an offline/failed read served from the local
 * replica, which for a dog is only ever a lower bound — see getEntriesByDog.
 */
function resolved(rows: unknown[], verified = true) {
  return { data: { rows, verified }, isLoading: false, isError: false, refetch: vi.fn() };
}

const defaultProps = {
  dogId: DOG_ID,
  viewer: 'exhibitor' as const,
  showAddDialog: false,
  onAddDialogClose: vi.fn(),
};

describe('UpcomingShowsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.setState({ competitions: [] });
    useEntriesByDogQueryMock.mockReturnValue(resolved([]));
  });

  describe('platform entries (the MYK9-121 false empty state)', () => {
    it('lists the dog’s upcoming platform entries instead of a false empty state', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([entryRow()]));

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Heartland Scent Work Classic')).toBeInTheDocument();
      expect(screen.getByText('Container Novice A')).toBeInTheDocument();
      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    });

    it('queries entries scoped to the dog whose page this is', () => {
      render(<UpcomingShowsSection {...defaultProps} />);

      expect(useEntriesByDogQueryMock).toHaveBeenCalledWith(DOG_ID);
    });

    it('renders every upcoming entry, not just the first', () => {
      useEntriesByDogQueryMock.mockReturnValue(
        resolved([
          entryRow(),
          entryRow({
            id: 'entry-2',
            show: { id: 'show-2', name: 'Prairie Trial', start_date: LATER },
            class: { id: 'class-2', name: 'Interior Novice B' },
          }),
        ])
      );

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Heartland Scent Work Classic')).toBeInTheDocument();
      expect(screen.getByText('Prairie Trial')).toBeInTheDocument();
    });

    it('excludes entries the canonical derivation does not count as upcoming', () => {
      useEntriesByDogQueryMock.mockReturnValue(
        resolved([
          entryRow(),
          entryRow({
            id: 'entry-scratched',
            entry_status: 'scratched',
            show: { id: 'show-3', name: 'Scratched Trial', start_date: LATER },
          }),
          entryRow({
            id: 'entry-past',
            show: { id: 'show-4', name: 'Last Year Trial', start_date: '2020-01-01' },
          }),
        ])
      );

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Heartland Scent Work Classic')).toBeInTheDocument();
      expect(screen.queryByText('Scratched Trial')).not.toBeInTheDocument();
      expect(screen.queryByText('Last Year Trial')).not.toBeInTheDocument();
    });

    it('speaks the entry status in the viewer’s voice, never the raw enum', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([entryRow()]));

      const { unmount } = render(<UpcomingShowsSection {...defaultProps} />);
      expect(screen.getByText('Submitted — awaiting review')).toBeInTheDocument();
      expect(screen.queryByText('submitted')).toBeNull();
      unmount();

      render(<UpcomingShowsSection {...defaultProps} viewer="secretary" />);
      expect(screen.getByText('Needs review')).toBeInTheDocument();
    });
  });

  describe('never a confident empty state while the read is unresolved', () => {
    it('renders a busy placeholder, not the empty copy, while loading', () => {
      useEntriesByDogQueryMock.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Loading upcoming shows')).toBeInTheDocument();
    });

    it('renders an error state, not the empty copy, when the read fails', () => {
      useEntriesByDogQueryMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
      expect(screen.getByText("Couldn't load upcoming shows")).toBeInTheDocument();
    });

    // `getEntriesByDog` verifies an empty local replica online, but
    // read-shape.ts SWALLOWS that verification's failure and returns the empty
    // array with `error: null` — so offline, `isError` is false and an unsynced
    // dog looks exactly like an unentered one.
    it('says it cannot check while offline instead of asserting an empty calendar', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([], false));

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
      expect(screen.getByText("Can't check for upcoming shows offline")).toBeInTheDocument();
    });

    it('still lists entries it did load while offline', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([entryRow()], false));

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Heartland Scent Work Classic')).toBeInTheDocument();
      expect(screen.queryByText("Can't check for upcoming shows offline")).not.toBeInTheDocument();
    });

    // An external show is device-local, so it is no evidence the platform read
    // resolved. Letting it satisfy `hasContent` would print "0 entries on
    // myK9Show" as though it were a fact.
    it('flags the unresolved platform read even when an external show is present', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([], false));
      useCompetitionStore.setState({
        competitions: [
          {
            id: '1',
            name: 'Spring Classic',
            date: '2026-05-15',
            location: 'Austin, TX',
            status: 'Upcoming',
            dogId: DOG_ID,
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Spring Classic')).toBeInTheDocument();
      expect(screen.queryByText('0 entries on myK9Show · 1 external show')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    });

    it('keeps device-saved external shows visible when the platform read fails', () => {
      useEntriesByDogQueryMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch: vi.fn(),
      });
      useCompetitionStore.setState({
        competitions: [
          {
            id: '1',
            name: 'Spring Classic',
            date: '2026-05-15',
            location: 'Austin, TX',
            status: 'Upcoming',
            dogId: DOG_ID,
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Spring Classic')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/couldn't load your myK9Show entries/i);
      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    });

    it('retries through the canonical query rather than reloading the page', async () => {
      const refetch = vi.fn();
      useEntriesByDogQueryMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch,
      });

      const { user } = render(<UpcomingShowsSection {...defaultProps} />);
      await user.click(screen.getByText('Retry'));

      expect(refetch).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('external shows are scoped to this dog', () => {
    it('hides external shows belonging to a different dog', () => {
      useCompetitionStore.setState({
        competitions: [
          {
            id: '1',
            name: 'Spring Classic',
            date: '2026-05-15',
            location: 'Austin, TX',
            status: 'Upcoming',
            dogId: DOG_ID,
          },
          {
            id: '2',
            name: 'Another Dogs Show',
            date: '2026-06-15',
            location: 'Dallas, TX',
            status: 'Upcoming',
            dogId: 'dog-someone-else',
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Spring Classic')).toBeInTheDocument();
      expect(screen.getByText('Austin, TX')).toBeInTheDocument();
      expect(screen.queryByText('Another Dogs Show')).not.toBeInTheDocument();
    });

    // Rows saved before dog stamping have a blank dogId. Scoping must not
    // strand them on no page at all.
    it('keeps unassigned legacy external shows visible', () => {
      useCompetitionStore.setState({
        competitions: [
          {
            id: '3',
            name: 'Legacy Unassigned Show',
            date: '2026-07-01',
            location: 'Tulsa, OK',
            status: 'Upcoming',
            dogId: '',
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Legacy Unassigned Show')).toBeInTheDocument();
      expect(screen.queryByText('No Upcoming Shows')).not.toBeInTheDocument();
    });

    it('still shows the empty state when every external show belongs to another dog', () => {
      useCompetitionStore.setState({
        competitions: [
          {
            id: '2',
            name: 'Another Dogs Show',
            date: '2026-06-15',
            location: 'Dallas, TX',
            status: 'Upcoming',
            dogId: 'dog-someone-else',
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('No Upcoming Shows')).toBeInTheDocument();
    });

    it('renders platform entries and this dog’s external shows together', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([entryRow()]));
      useCompetitionStore.setState({
        competitions: [
          {
            id: '1',
            name: 'Spring Classic',
            date: '2026-05-15',
            location: 'Austin, TX',
            status: 'Upcoming',
            dogId: DOG_ID,
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('Heartland Scent Work Classic')).toBeInTheDocument();
      expect(screen.getByText('Spring Classic')).toBeInTheDocument();
      expect(screen.getAllByTestId('section-card')).toHaveLength(2);
    });
  });

  describe('empty state and counts', () => {
    it('shows the empty state only when the dog genuinely has nothing booked', () => {
      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('No Upcoming Shows')).toBeInTheDocument();
      expect(screen.queryAllByTestId('section-card')).toHaveLength(0);
    });

    it('navigates to /shows when Browse Shows is clicked', async () => {
      const { user } = render(<UpcomingShowsSection {...defaultProps} />);

      await user.click(screen.getByText('Browse Shows'));

      expect(mockNavigate).toHaveBeenCalledWith('/shows');
    });

    it('labels the count with an explicit unit and source', () => {
      useEntriesByDogQueryMock.mockReturnValue(resolved([entryRow()]));
      useCompetitionStore.setState({
        competitions: [
          {
            id: '1',
            name: 'Spring Classic',
            date: '2026-05-15',
            location: 'Austin, TX',
            status: 'Upcoming',
            dogId: DOG_ID,
          },
        ],
      });

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('1 entry on myK9Show · 1 external show')).toBeInTheDocument();
    });

    it('pluralizes the entry unit', () => {
      useEntriesByDogQueryMock.mockReturnValue(
        resolved([
          entryRow(),
          entryRow({
            id: 'entry-2',
            show: { id: 'show-2', name: 'Prairie Trial', start_date: LATER },
          }),
        ])
      );

      render(<UpcomingShowsSection {...defaultProps} />);

      expect(screen.getByText('2 entries on myK9Show')).toBeInTheDocument();
    });
  });
});

describe('Career and Overview agree about a dog’s upcoming entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.setState({ competitions: [] });
  });

  // Acceptance criterion 1: the two surfaces must not disagree about scope.
  // Both render from the same mocked canonical query, so a surface that
  // reintroduces its own source diverges here.
  it.each([
    ['a live submitted entry', entryRow(), true],
    ['a scratched entry', entryRow({ entry_status: 'scratched' }), false],
    [
      'a past show',
      entryRow({ show: { id: 's', name: 'Old Trial', start_date: '2020-01-01' } }),
      false,
    ],
  ])('%s appears on both surfaces or neither', (_label, row, expectedVisible) => {
    useEntriesByDogQueryMock.mockReturnValue(resolved([row]));
    const showName = (row.show as { name: string }).name;

    const career = render(<UpcomingShowsSection {...defaultProps} />);
    const onCareer = screen.queryAllByText(showName).length > 0;
    career.unmount();

    const overview = render(<ActivityTab dogId={DOG_ID} dogName="Willow" role="exhibitor" />);
    const onOverview = within(overview.container).queryAllByText(showName).length > 0;
    overview.unmount();

    expect(onCareer).toBe(expectedVisible);
    expect(onOverview).toBe(expectedVisible);
    expect(onCareer).toBe(onOverview);
  });
});
