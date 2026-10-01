/**
 * MYK9-263/MYK9-805: the dog Career → Past Results card must withhold an
 * unreleased class's placement and label it "preliminary" — the same rule
 * My Shows already enforces via `deriveResultReleaseDisplay`.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import PastResultsSection from './PastResultsSection';

const { mockExhibitorResults } = vi.hoisted(() => ({
  mockExhibitorResults: vi.fn(),
}));

vi.mock('@/hooks/queries/useExhibitorResults', () => ({
  useExhibitorResults: mockExhibitorResults,
}));
vi.mock('@/hooks/queries/useManualResultsDatabase', () => ({
  useManualResultsQuery: () => ({ data: [] }),
  useCreateManualResultMutation: () => ({ mutate: vi.fn() }),
  useUpdateManualResultMutation: () => ({ mutate: vi.fn() }),
  useDeleteManualResultMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

function platformResult(overrides: Partial<ExhibitorResult> = {}): ExhibitorResult {
  return {
    id: 'result-1',
    dogId: 'dog-willow',
    dogName: 'Willow',
    dogCallName: 'Willow',
    showId: 'show-1',
    classId: 'class-1',
    trialId: 'trial-1',
    className: 'Interior Advanced Preliminary',
    classLevel: 'Advanced',
    classElement: 'Interior',
    resultText: 'Q',
    resultStatus: 'qualified',
    searchTimeSeconds: 52.4,
    totalFaults: 0,
    finalPlacement: 1,
    scoringCompletedAt: '2026-11-09T15:00:00Z',
    showName: 'Heartland Scent Work Classic',
    showDate: '2026-11-09',
    resultsReleasedAt: null,
    ...overrides,
  };
}

function renderSection(results: ExhibitorResult[]) {
  mockExhibitorResults.mockReturnValue({ data: results });
  return render(
    <PastResultsSection
      dogId="dog-willow"
      isPremium={false}
      addDialogOpen={false}
      setAddDialogOpen={vi.fn()}
    />
  );
}

describe('PastResultsSection — platform results release gate', () => {
  it('labels a result with no known date instead of leaving it blank', () => {
    renderSection([platformResult({ showDate: '' })]);
    expect(screen.getByText('Date unavailable')).toBeInTheDocument();
  });

  it('does not claim there are no results while the dog roster is loading', () => {
    mockExhibitorResults.mockReturnValue({
      data: [],
      isError: false,
      isLoading: true,
      retry: vi.fn(),
    });
    render(
      <PastResultsSection
        dogId="dog-willow"
        isPremium={false}
        addDialogOpen={false}
        setAddDialogOpen={vi.fn()}
      />
    );
    expect(screen.getByText('Loading results…')).toBeInTheDocument();
    expect(screen.queryByText(/No results yet/)).not.toBeInTheDocument();
  });

  it('shows retry instead of a false no-results claim when the result read fails', () => {
    mockExhibitorResults.mockReturnValue({
      data: [],
      isError: true,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(
      <PastResultsSection
        dogId="dog-willow"
        isPremium={false}
        addDialogOpen={false}
        setAddDialogOpen={vi.fn()}
      />
    );
    expect(screen.getByText(/Results could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/No results yet/)).not.toBeInTheDocument();
  });

  it("links today's platform result to its class detail", () => {
    renderSection([platformResult({ showDate: '2026-09-28' })]);
    expect(screen.getByRole('link', { name: 'Heartland Scent Work Classic' })).toHaveAttribute(
      'href',
      '/shows/show-1/trials/trial-1/classes/class-1'
    );
  });

  it('withholds the placement and labels the result preliminary before release', () => {
    renderSection([platformResult()]);

    expect(screen.getByText('preliminary')).toBeInTheDocument();
    expect(screen.queryByText('#1')).not.toBeInTheDocument();
  });

  it('shows the placement and says nothing about "preliminary" once released', () => {
    renderSection([
      platformResult({ resultsReleasedAt: '2026-11-09T18:00:00Z', className: 'Interior Advanced' }),
    ]);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.queryByText('preliminary')).not.toBeInTheDocument();
  });

  it('never shows a placement for a non-qualifying result, released or not', () => {
    renderSection([
      platformResult({
        resultsReleasedAt: '2026-11-09T18:00:00Z',
        resultStatus: 'nq',
        resultText: 'NQ',
        finalPlacement: 2,
      }),
    ]);

    expect(screen.queryByText('#2')).not.toBeInTheDocument();
  });
});
