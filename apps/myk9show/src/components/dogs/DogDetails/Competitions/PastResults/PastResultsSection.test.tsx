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
  mockExhibitorResults: vi.fn<() => { data: ExhibitorResult[] }>(),
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
