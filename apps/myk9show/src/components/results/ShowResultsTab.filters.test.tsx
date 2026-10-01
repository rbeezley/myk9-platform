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

describe('ShowResultsTab class-name search', () => {
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

  it('narrows by class-name search and says so in a sentence', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.type(screen.getByPlaceholderText('Search by class name...'), 'Exterior');

    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 classes.');
  });

  it('offers no Element or Level filter (cut by MYK9-906)', () => {
    render(<ShowResultsTab showId="show-1" />);

    expect(screen.queryByRole('button', { name: /^Filter$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Element' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Level' })).not.toBeInTheDocument();
  });

  it('"Show all classes" clears the search', async () => {
    const { user } = render(<ShowResultsTab showId="show-1" />);

    await user.type(screen.getByPlaceholderText('Search by class name...'), 'Exterior');
    await user.click(screen.getByRole('button', { name: 'Show all classes' }));

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('Exterior Excellent A')).toBeInTheDocument();
  });
});
