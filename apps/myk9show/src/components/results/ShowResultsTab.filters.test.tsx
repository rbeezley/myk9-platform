import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowResultsTab } from './ShowResultsTab';
import { useShowResults, type ClassResult } from '@/hooks/queries/useShowResults';
import { useShowClassProgress, type ShowClassProgress } from '@/hooks/queries/useShowClassProgress';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { useVisibleResultFields } from '@/hooks/useVisibleResultFields';

vi.mock('@/hooks/queries/useShowResults', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/queries/useShowResults')>(
    '@/hooks/queries/useShowResults'
  );
  return {
    ...actual,
    useShowResults: vi.fn(),
  };
});

vi.mock('@/hooks/queries/useShowClassProgress', () => ({
  useShowClassProgress: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/queries/useShowStats', () => ({
  useShowStats: vi.fn(),
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: vi.fn(),
}));

vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: vi.fn(),
  deriveClassState: () => 'released',
}));

function makeClass(overrides: Partial<ClassResult> & { classId: string }): ClassResult {
  return {
    className: 'Class',
    element: 'Interior',
    level: 'Novice',
    section: null,
    trialId: 'trial-1',
    resultsReleasedAt: '2026-05-01T00:00:00Z',
    placements: [
      { placement: 1, handlerName: 'Handler', dogName: 'Dog', breed: 'Breed', armband: '1' },
    ],
    ...overrides,
  };
}

function entry(overrides: Partial<StatsEntry> & { id: string; classId: string }): StatsEntry {
  return {
    dogId: 'dog-1',
    dogCallName: 'Rex',
    showId: 'show-1',
    showName: '',
    showDate: '',
    className: 'Interior Novice A',
    classElement: 'Interior',
    classLevel: 'Novice',
    resultText: 'Q',
    searchTimeSeconds: 40,
    totalFaults: 0,
    finalPlacement: 1,
    ...overrides,
  };
}

const RESULTS: ClassResult[] = [
  makeClass({
    classId: 'c1',
    className: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
  }),
  makeClass({
    classId: 'c2',
    className: 'Exterior Excellent A',
    element: 'Exterior',
    level: 'Excellent',
  }),
];

describe('ShowResultsTab class-name search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(useShowClassProgress).mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof useShowClassProgress
    >);
    vi.mocked(useShowResults).mockReturnValue({
      data: RESULTS,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useShowResults>);
    vi.mocked(useShowStats).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useShowStats>);
    vi.mocked(useShowJudges).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useShowJudges>);
    vi.mocked(useVisibleResultFields).mockReturnValue({
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
      selfCheckinEnabled: true,
      isLoading: false,
    });
  });

  it('shows every class with no filter applied', () => {
    render(<ShowResultsTab showId="show-1" />);

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });

  it('narrows by class-name search and says so in a sentence', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.type(screen.getByPlaceholderText('Search by class name...'), 'Exterior');

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 classes.')).toBeInTheDocument();
  });

  it('reads trial, element and level from the URL and narrows the podium', () => {
    render(<ShowResultsTab showId="show-1" />, {
      initialRoute: '/?element=Exterior&level=Excellent',
    });

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
    expect(screen.getByText('Element: Exterior')).toBeInTheDocument();
    expect(screen.getByText('Level: Excellent')).toBeInTheDocument();
  });

  it('narrows by trial from the URL', () => {
    vi.mocked(useShowResults).mockReturnValue({
      data: [
        makeClass({ classId: 'c1', className: 'Interior Novice A', trialId: 't1' }),
        makeClass({ classId: 'c2', className: 'Exterior Excellent A', trialId: 't2' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useShowResults>);

    render(<ShowResultsTab showId="show-1" />, { initialRoute: '/?trial=t2' });

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });

  it('sets a filter from the Filter menu', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(await screen.findByText('Exterior'));

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });

  describe('pending classes (from class counters)', () => {
    const progress = (
      over: Partial<ShowClassProgress> & { classId: string }
    ): ShowClassProgress => ({
      className: 'Class',
      trialId: 't1',
      element: 'Interior',
      level: 'Novice',
      scoredCount: 0,
      resultsReleasedAt: null,
      ...over,
    });

    function mockProgress(rows: ShowClassProgress[], podium: ClassResult[] = []) {
      vi.mocked(useShowClassProgress).mockReturnValue({ data: rows } as unknown as ReturnType<
        typeof useShowClassProgress
      >);
      vi.mocked(useShowResults).mockReturnValue({
        data: podium,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useShowResults>);
    }

    const ROWS = [
      progress({
        classId: 'p1',
        className: 'Buried Master',
        element: 'Buried',
        level: 'Master',
        scoredCount: 4,
      }),
      progress({
        classId: 'p2',
        className: 'Vehicle Open',
        element: 'Vehicle',
        level: 'Open',
        trialId: 't2',
      }),
      progress({
        classId: 'r1',
        className: 'Released Class',
        resultsReleasedAt: '2026-05-01T00:00:00Z',
        scoredCount: 9,
      }),
    ];

    it('lists unreleased classes with the server scored count, never a released one', () => {
      mockProgress(ROWS, RESULTS);
      render(<ShowResultsTab showId="show-1" />);

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Buried Master');
      expect(list).toHaveTextContent('4 scored, awaiting release');
      expect(list).toHaveTextContent('Vehicle Open');
      expect(list).toHaveTextContent('Not scored yet');
      expect(list).not.toHaveTextContent('Released Class');
    });

    it('does not read entries: a moved, withdrawn or withheld entry cannot change the list', () => {
      mockProgress(ROWS, RESULTS);
      vi.mocked(useShowStats).mockReturnValue({
        data: [
          entry({ id: 'm', classId: 'p2', resultText: 'pending', resultWithheld: true }),
          entry({ id: 'w', classId: 'p1', resultText: 'NQ' }),
        ],
      } as unknown as ReturnType<typeof useShowStats>);
      render(<ShowResultsTab showId="show-1" />);

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Vehicle Open');
      expect(list).toHaveTextContent('Not scored yet');
      expect(list).toHaveTextContent('4 scored, awaiting release');
    });

    it('narrows by the URL filters and the class-name search, with no podium at all', async () => {
      mockProgress(ROWS);
      const { user, unmount } = render(<ShowResultsTab showId="show-1" />, {
        initialRoute: '/?element=Buried',
      });
      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(screen.getByText('Element: Buried')).toBeInTheDocument();
      expect(list).toHaveTextContent('Buried Master');
      expect(list).not.toHaveTextContent('Vehicle Open');
      unmount();

      const second = render(<ShowResultsTab showId="show-1" />);
      await second.user.type(screen.getByPlaceholderText('Search by class name...'), 'Vehicle');
      const searched = screen.getByRole('region', { name: /Pending classes/ });
      expect(searched).toHaveTextContent('Vehicle Open');
      expect(searched).not.toHaveTextContent('Buried Master');
      expect(user).toBeDefined();
    });

    it('round-trips the sub-tab through the URL', () => {
      vi.mocked(useShowStats).mockReturnValue({
        data: [entry({ id: 's', classId: 'c1' })],
      } as unknown as ReturnType<typeof useShowStats>);
      render(<ShowResultsTab showId="show-1" />, {
        initialRoute: '/?resultsView=show-stats&breed=Beagle',
      });

      expect(screen.getByRole('tab', { name: 'Show Stats' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });

  it('"Show all classes" clears the search', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.type(screen.getByPlaceholderText('Search by class name...'), 'Exterior');
    await user.click(screen.getByRole('button', { name: 'Show all classes' }));

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });
});
