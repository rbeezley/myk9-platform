import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowResultsTab } from './ShowResultsTab';
import { useShowResults, type ClassResult } from '@/hooks/queries/useShowResults';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
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

describe('ShowResultsTab element/level filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('narrows to the selected element', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.click(screen.getByRole('button', { name: /^Filter$/ }));
    await user.click(screen.getByRole('button', { name: 'Element' }));
    await user.click(screen.getByRole('button', { name: 'Interior' }));

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.queryByText('Exterior Excellent A')).not.toBeInTheDocument();
  });

  it('narrows by class-name search', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.type(screen.getByPlaceholderText('Search by class name...'), 'Exterior');

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });

  it('reports the shown/total count matching the visible rows', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.click(screen.getByRole('button', { name: /^Filter$/ }));
    await user.click(screen.getByRole('button', { name: 'Level' }));
    await user.click(screen.getByRole('button', { name: 'Novice' }));

    expect(screen.getByText('1 class', { exact: false })).toBeInTheDocument();
  });

  // Codex P2 on PR #2566: search used to live behind the same
  // `elements.length > 1 || levels.length > 1` gate as the Element/Level
  // filters, so a show with just one element and one level hid the search
  // box along with them — with no way to search or clear a carried-over
  // filter state.
  describe('with a single element and level', () => {
    beforeEach(() => {
      vi.mocked(useShowResults).mockReturnValue({
        data: [
          makeClass({ classId: 'c1', className: 'Interior Novice A' }),
          makeClass({ classId: 'c2', className: 'Interior Novice B' }),
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useShowResults>);
    });

    it('still shows the search box', () => {
      render(<ShowResultsTab showId="show-1" />);

      expect(screen.getByPlaceholderText('Search by class name...')).toBeInTheDocument();
    });

    it('narrows by search even with nothing to filter by element or level', async () => {
      const { user } = render(<ShowResultsTab showId="show-1" />);

      await user.type(screen.getByPlaceholderText('Search by class name...'), 'B');

      expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
      expect(screen.getByText('Interior Novice B')).toBeInTheDocument();
    });

    it('omits the moot Element/Level filter fields (no "+ Filter" menu with nothing to add)', () => {
      render(<ShowResultsTab showId="show-1" />);

      // With Element and Level each locked to one value, ListFilterBar has no
      // field left to offer, so it hides the "+ Filter" menu entirely.
      expect(screen.queryByRole('button', { name: /^Filter$/ })).not.toBeInTheDocument();
    });
  });
});
