import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import TitleProgressSection from './TitleProgressSection';
import type { TitleProgressResult } from '@/services/titleEngine';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: vi.fn(),
}));

import { useTitleProgress } from '@/hooks/useTitleProgress';

const mockedUseTitleProgress = vi.mocked(useTitleProgress);

function mockTitleProgress(overrides: Partial<ReturnType<typeof useTitleProgress>>) {
  mockedUseTitleProgress.mockReturnValue({
    progressBySport: {},
    templates: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    earnedAbbreviations: [],
    ...overrides,
  });
}

describe('TitleProgressSection', () => {
  it('shows a loading state', () => {
    mockTitleProgress({ isLoading: true });
    render(<TitleProgressSection dogId="dog-1" ownerId="owner-1" />);
    expect(screen.getByRole('status', { name: /loading title progress/i })).toBeInTheDocument();
  });

  it('shows a non-blaming error with Retry that triggers refetch', () => {
    const refetch = vi.fn();
    mockTitleProgress({ isError: true, refetch });
    render(<TitleProgressSection dogId="dog-1" ownerId="owner-1" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/couldn.?t load title progress/i);
    // Non-blaming: does not tell the exhibitor they did anything wrong.
    expect(alert.textContent?.toLowerCase()).not.toMatch(/you (did|caused|made)/);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows feature-specific empty guidance with no demonstration data when there is no progress', () => {
    mockTitleProgress({ progressBySport: {} });
    render(<TitleProgressSection dogId="dog-1" ownerId="owner-1" />);

    expect(screen.getByText(/no title progress yet/i)).toBeInTheDocument();
    // No fabricated numbers/percentages rendered as if they were the dog's data.
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+ Qs/)).not.toBeInTheDocument();
  });

  it('renders populated state derived only from the mocked hook data (source-grounded)', () => {
    const progress: TitleProgressResult = {
      titleId: 'title-1',
      abbreviation: 'SCN',
      fullName: 'Scent Work Container Novice',
      titleType: 'element',
      sportTemplateId: 'sport-1',
      earnedLegs: 2,
      requiredLegs: 3,
      percentage: 66,
      isEarned: false,
      earnedDate: null,
      requiredElementTitles: [],
      earnedElementTitles: [],
      prerequisiteMet: true,
      isSuperseded: false,
      legs: [],
      sortOrder: 1,
    };
    mockTitleProgress({
      progressBySport: { 'sport-1': [progress] },
      templates: [
        {
          id: 'sport-1',
          organization: 'AKC',
          sport_code: 'scent-work',
          name: 'Scent Work',
          levels: [],
        } as unknown as ReturnType<typeof useTitleProgress>['templates'][number],
      ],
    });
    render(<TitleProgressSection dogId="dog-1" ownerId="owner-1" />);

    expect(screen.getByText('AKC')).toBeInTheDocument();
  });
});
