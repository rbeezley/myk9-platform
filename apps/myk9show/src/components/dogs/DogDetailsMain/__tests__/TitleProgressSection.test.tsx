import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import TitleProgressSection from '../TitleProgressSection';
import { computeTitleProgress } from '@/services/titleEngine';
import { levelResolverForTemplate } from '@/features/registries/elementLevels';
import {
  AKC_FLAT_LEVELS,
  buildAkcScentWorkTitles,
} from '@/services/__tests__/fixtures/akcScentWorkTitles';

// Written from inside tests, so reset from a factory before every test: CI
// shuffles test order within a file (MYK9-669).
const { progress, resetProgress } = vi.hoisted(() => {
  const defaults = () => ({
    value: {
      progressBySport: {} as Record<string, unknown[]>,
      earnedAbbreviations: [] as string[],
      isLoading: false,
    },
  });
  const progress = defaults();
  return { progress, resetProgress: (): void => void Object.assign(progress, defaults()) };
});

beforeEach(resetProgress);

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => progress.value,
}));

describe('TitleProgressSection', () => {
  it('renders nothing when the dog has no tracks and no titles', () => {
    progress.value = { progressBySport: {}, earnedAbbreviations: [], isLoading: false };
    const { container } = render(<TitleProgressSection dogId="dog-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('summarizes title counts and links to the full Career view without duplicating tracks', () => {
    progress.value = {
      progressBySport: {
        'scent-work': [
          {
            titleId: 't1',
            fullName: 'Scent Work Excellent',
            earnedLegs: 2,
            requiredLegs: 3,
            isEarned: false,
            isSuperseded: false,
            prerequisiteMet: true,
          },
        ],
      },
      earnedAbbreviations: ['SWN', 'SWA'],
      isLoading: false,
    };
    render(<TitleProgressSection dogId="dog-1" />);
    expect(screen.getByText('1 title in progress · 2 titles earned')).toBeInTheDocument();
    expect(screen.queryByText('Scent Work Excellent')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see full progress/i })).toHaveAttribute(
      'href',
      '/dogs/dog-1?section=career&view=titles'
    );
  });

  it('does not count untouched or prerequisite-locked catalogue titles', () => {
    progress.value = {
      progressBySport: {
        'scent-work': [
          { isEarned: false, isSuperseded: false, prerequisiteMet: true, earnedLegs: 0 },
          { isEarned: false, isSuperseded: false, prerequisiteMet: false, earnedLegs: 2 },
        ],
      },
      earnedAbbreviations: [],
      isLoading: false,
    };
    const { container } = render(<TitleProgressSection dogId="dog-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The count's whole job is to exclude the catalogue a dog has never touched,
   * and it leans on `prerequisiteMet` / `earnedLegs`. A hand-shaped literal
   * can't catch a projection that drops either field upstream, so these run
   * REAL engine output through the component.
   */
  describe('with real title-engine output', () => {
    const akcLevels = levelResolverForTemplate({ sport_code: 'akc-scent-work' }, AKC_FLAT_LEVELS);

    function renderWithLegs(legs: Parameters<typeof computeTitleProgress>[0]) {
      progress.value = {
        progressBySport: {
          'akc-scent-work': computeTitleProgress(legs, buildAkcScentWorkTitles(), akcLevels),
        },
        earnedAbbreviations: [],
        isLoading: false,
      };
      return render(<TitleProgressSection dogId="dog-1" />);
    }

    it('counts nothing for a dog that has never trialed', () => {
      // 49 seeded titles, 7 of them immediately pursuable — none of them started.
      const { container } = renderWithLegs([]);
      expect(container).toBeEmptyDOMElement();
    });

    it('counts only the title the dog has actually started', () => {
      renderWithLegs([
        {
          id: 'leg-0',
          source: 'platform' as const,
          element: 'Container',
          level: 'Novice',
          trial_date: '2026-03-01',
          show_name: 'Spring Trial',
        },
      ]);
      expect(screen.getByText('1 title in progress · 0 titles earned')).toBeInTheDocument();
    });
  });
});
