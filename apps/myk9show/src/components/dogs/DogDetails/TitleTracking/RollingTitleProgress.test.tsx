import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import RollingTitleProgress from './RollingTitleProgress';
import type { TitleProgressResult } from '@/services/titleEngine';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: vi.fn(),
}));

import { useTitleProgress } from '@/hooks/useTitleProgress';

function makeTrack(overrides: Partial<TitleProgressResult>): TitleProgressResult {
  return {
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
    legs: [
      {
        id: 'leg-1',
        source: 'platform',
        element: 'Container',
        level: 'Novice',
        trial_date: '2026-04-12',
        show_name: 'Millbrook',
      },
      {
        id: 'leg-2',
        source: 'platform',
        element: 'Container',
        level: 'Novice',
        trial_date: '2026-03-29',
        show_name: 'Hudson Valley',
      },
    ],
    sortOrder: 1,
    ...overrides,
  };
}

function mockTitleProgress(
  progressBySport: Record<string, TitleProgressResult[]>,
  isLoading = false
) {
  vi.mocked(useTitleProgress).mockReturnValue({
    progressBySport,
    templates: [],
    isLoading,
    earnedAbbreviations: [],
  });
}

describe('RollingTitleProgress', () => {
  it('renders nothing while loading', () => {
    mockTitleProgress({}, true);
    const { container } = render(<RollingTitleProgress dogId="dog-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no tracks and no earned titles', () => {
    mockTitleProgress({});
    const { container } = render(<RollingTitleProgress dogId="dog-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for tracks that have zero earned legs', () => {
    const noLegsTrack = makeTrack({ earnedLegs: 0, legs: [] });
    mockTitleProgress({ sport1: [noLegsTrack] });
    const { container } = render(<RollingTitleProgress dogId="dog-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for locked (prerequisite not met) tracks', () => {
    const lockedTrack = makeTrack({ prerequisiteMet: false });
    mockTitleProgress({ sport1: [lockedTrack] });
    const { container } = render(<RollingTitleProgress dogId="dog-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows element and level as the row label', () => {
    mockTitleProgress({ sport1: [makeTrack({})] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('shows the title abbreviation in the "Toward" subtitle', () => {
    mockTitleProgress({ sport1: [makeTrack({})] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('SCN')).toBeInTheDocument();
  });

  it('shows earned/required Qs count', () => {
    mockTitleProgress({ sport1: [makeTrack({ earnedLegs: 2, requiredLegs: 3 })] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('2/3 Qs')).toBeInTheDocument();
  });

  it('shows the last Q label with most recent leg date and show name', () => {
    mockTitleProgress({ sport1: [makeTrack({})] });
    render(<RollingTitleProgress dogId="dog-1" />);
    // Most recent leg is 2026-04-12 at Millbrook
    expect(screen.getByText('Last Q')).toBeInTheDocument();
    expect(screen.getByText('Apr 12 · Millbrook')).toBeInTheDocument();
  });

  it('uses dogName in the subtitle when provided', () => {
    mockTitleProgress({ sport1: [makeTrack({})] });
    render(<RollingTitleProgress dogId="dog-1" dogName="Rosie" />);
    expect(screen.getByText(/How close Rosie is to/)).toBeInTheDocument();
  });

  it('falls back to "this dog" when dogName is omitted', () => {
    mockTitleProgress({ sport1: [makeTrack({})] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText(/How close this dog is to/)).toBeInTheDocument();
  });

  it('shows the "Titles earned" section for earned non-superseded titles', () => {
    const earned = makeTrack({
      isEarned: true,
      isSuperseded: false,
      earnedDate: '2026-02-22',
      earnedLegs: 3,
    });
    mockTitleProgress({ sport1: [earned] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('Titles earned')).toBeInTheDocument();
    expect(screen.getByText('SCN')).toBeInTheDocument();
  });

  it('does not show superseded earned titles', () => {
    const superseded = makeTrack({ isEarned: true, isSuperseded: true, earnedLegs: 3 });
    mockTitleProgress({ sport1: [superseded] });
    const { container } = render(<RollingTitleProgress dogId="dog-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders multiple in-progress tracks from multiple sports', () => {
    const track1 = makeTrack({
      titleId: 't1',
      abbreviation: 'SCN',
      earnedLegs: 1,
      requiredLegs: 3,
    });
    const track2 = makeTrack({
      titleId: 't2',
      abbreviation: 'SIN',
      fullName: 'Scent Work Interior Novice',
      earnedLegs: 2,
      requiredLegs: 3,
      legs: [
        {
          id: 'leg-3',
          source: 'platform',
          element: 'Interior',
          level: 'Novice',
          trial_date: '2026-04-01',
          show_name: 'Bergen Co',
        },
      ],
    });
    mockTitleProgress({ sport1: [track1], sport2: [track2] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('1/3 Qs')).toBeInTheDocument();
    expect(screen.getByText('2/3 Qs')).toBeInTheDocument();
    expect(screen.getByText('Interior Novice')).toBeInTheDocument();
  });

  it('renders correct pip count accessible label', () => {
    mockTitleProgress({ sport1: [makeTrack({ earnedLegs: 2, requiredLegs: 3 })] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByLabelText('2 of 3 qualifying runs')).toBeInTheDocument();
  });

  it('falls back to fullName as row label when legs have no element/level', () => {
    const track = makeTrack({
      fullName: 'Scent Work Container Novice',
      legs: [
        {
          id: 'leg-1',
          source: 'platform',
          element: '',
          level: '',
          trial_date: '2026-04-12',
          show_name: 'Millbrook',
        },
      ],
    });
    mockTitleProgress({ sport1: [track] });
    render(<RollingTitleProgress dogId="dog-1" />);
    expect(screen.getByText('Scent Work Container Novice')).toBeInTheDocument();
  });
});
