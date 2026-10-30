import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowResultsTab } from './ShowResultsTab';
import { useShowResults, type ClassResult } from '@/hooks/queries/useShowResults';
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

  it('lists pending classes: entries whose class has no podium, narrowed by the same filters', () => {
    vi.mocked(useShowStats).mockReturnValue({
      data: [
        entry({ id: 'e1', classId: 'c1' }),
        entry({
          id: 'e2',
          classId: 'p1',
          className: 'Buried Master',
          classElement: 'Buried',
          classLevel: 'Master',
        }),
        entry({
          id: 'e3',
          classId: 'p2',
          className: 'Vehicle Open',
          classElement: 'Vehicle',
          classLevel: 'Open',
          resultText: 'pending',
        }),
      ],
    } as unknown as ReturnType<typeof useShowStats>);

    const { unmount } = render(<ShowResultsTab showId="show-1" />);
    const list = screen.getByRole('region', { name: /Pending classes/ });
    expect(list).toHaveTextContent('Buried Master');
    expect(list).toHaveTextContent('Scored, awaiting release');
    expect(list).toHaveTextContent('Vehicle Open');
    expect(list).toHaveTextContent('Not scored yet');
    expect(list).not.toHaveTextContent('Interior Novice A');
    unmount();

    render(<ShowResultsTab showId="show-1" />, { initialRoute: '/?element=Buried' });
    const narrowed = screen.getByRole('region', { name: /Pending classes/ });
    expect(narrowed).toHaveTextContent('Buried Master');
    expect(narrowed).not.toHaveTextContent('Vehicle Open');
  });

  describe('pending classes (review fixes)', () => {
    const pendingEntries = [
      entry({
        id: 'p1',
        classId: 'p1',
        className: 'Buried Master',
        classElement: 'Buried',
        classLevel: 'Master',
        trialId: 't1',
      }),
      entry({
        id: 'p2',
        classId: 'p2',
        className: 'Vehicle Open',
        classElement: 'Vehicle',
        classLevel: 'Open',
        trialId: 't1',
        resultText: 'pending',
      }),
    ];

    function mockNoPodium(entries: StatsEntry[]) {
      vi.mocked(useShowResults).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useShowResults>);
      vi.mocked(useShowStats).mockReturnValue({ data: entries } as unknown as ReturnType<
        typeof useShowStats
      >);
    }

    it('counts a withheld scored result as scored', () => {
      vi.mocked(useShowStats).mockReturnValue({
        data: [
          entry({
            id: 'w',
            classId: 'p1',
            className: 'Buried Master',
            classElement: 'Buried',
            classLevel: 'Master',
            resultText: 'pending',
            resultWithheld: true,
          }),
        ],
      } as unknown as ReturnType<typeof useShowStats>);
      render(<ShowResultsTab showId="show-1" />);

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Scored, awaiting release');
      expect(list).not.toHaveTextContent('Not scored yet');
    });

    it('keeps filters and filtered pending classes when nothing has a podium', () => {
      mockNoPodium(pendingEntries);
      render(<ShowResultsTab showId="show-1" />, { initialRoute: '/?element=Buried' });

      expect(screen.getByText('Element: Buried')).toBeInTheDocument();
      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Buried Master');
      expect(list).not.toHaveTextContent('Vehicle Open');
    });

    it('applies the class-name search to pending classes', async () => {
      mockNoPodium(pendingEntries);
      const { user } = render(<ShowResultsTab showId="show-1" />);

      await user.type(screen.getByPlaceholderText('Search by class name...'), 'Vehicle');

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Vehicle Open');
      expect(list).not.toHaveTextContent('Buried Master');
    });

    it('ignores withdrawn and scratched entries in pending classes', () => {
      mockNoPodium([
        entry({
          id: 'x',
          classId: 'x1',
          className: 'Only Withdrawn',
          resultText: 'pending',
          entryStatus: 'withdrawn',
        }),
        entry({
          id: 'y',
          classId: 'y1',
          className: 'Done Class',
          resultText: 'Q',
          entryStatus: 'confirmed',
        }),
        entry({
          id: 'z',
          classId: 'y1',
          className: 'Done Class',
          resultText: 'pending',
          entryStatus: 'scratched',
        }),
      ]);
      render(<ShowResultsTab showId="show-1" />);

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).not.toHaveTextContent('Only Withdrawn');
      expect(list).toHaveTextContent('Scored, awaiting release');
    });

    it('ignores moved and not-accepted entries in pending classes', () => {
      mockNoPodium([
        entry({
          id: 'm',
          classId: 'm1',
          className: 'Moved Source',
          resultText: 'pending',
          entryStatus: 'moved',
        }),
        entry({
          id: 'n',
          classId: 'n1',
          className: 'Expired Promo',
          resultText: 'pending',
          entryStatus: 'promotion-expired',
        }),
        entry({
          id: 'k',
          classId: 'k1',
          className: 'Live Class',
          resultText: 'pending',
          entryStatus: 'confirmed',
        }),
      ]);
      render(<ShowResultsTab showId="show-1" />);

      const list = screen.getByRole('region', { name: /Pending classes/ });
      expect(list).toHaveTextContent('Live Class');
      expect(list).not.toHaveTextContent('Moved Source');
      expect(list).not.toHaveTextContent('Expired Promo');
    });

    it('reopens the sub-tab named in the URL', () => {
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

    it('does not list a released class that simply has no placements', () => {
      mockNoPodium([
        entry({
          id: 'r',
          classId: 'r1',
          className: 'Released All NQ',
          resultText: 'NQ',
          classResultsReleasedAt: '2026-05-01T00:00:00Z',
        }),
      ]);
      render(<ShowResultsTab showId="show-1" />);

      expect(screen.queryByText('Released All NQ')).not.toBeInTheDocument();
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
