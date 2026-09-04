import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import TitleProgressSection from '../TitleProgressSection';
import { computeTitleProgress } from '@/services/titleEngine';
import { levelResolverForTemplate } from '@/features/registries/elementLevels';
import {
  AKC_FLAT_LEVELS,
  buildAkcScentWorkTitles,
} from '@/services/__tests__/fixtures/akcScentWorkTitles';

const progress = vi.hoisted(() => ({
  value: {
    progressBySport: {} as Record<string, unknown[]>,
    earnedAbbreviations: [] as string[],
    isLoading: false,
  },
}));

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => progress.value,
}));

describe('TitleProgressSection', () => {
  it('renders nothing when the dog has no tracks and no titles', () => {
    progress.value = { progressBySport: {}, earnedAbbreviations: [], isLoading: false };
    const { container } = render(<TitleProgressSection dogId="dog-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows in-progress tracks as a progress bar and earned titles as chips', () => {
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
          },
        ],
      },
      earnedAbbreviations: ['SWN', 'SWA'],
      isLoading: false,
    };
    render(<TitleProgressSection dogId="dog-1" />);
    expect(screen.getByText('Scent Work Excellent')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 qualifying runs')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
    expect(screen.getByText('SWN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see full progress/i })).toHaveAttribute(
      'href',
      '/dogs/dog-1?section=career&view=titles'
    );
  });

  /**
   * The card picks its three tracks by slicing the engine's sorted output, so the
   * selection is only as good as the prerequisite chain behind it. These cases run
   * real engine output through the component rather than a hand-shaped literal —
   * a projection that dropped `prerequisiteMet` upstream would still look right in
   * a literal.
   */
  describe('with real title-engine output for a dog that has never trialed', () => {
    const akcLevels = levelResolverForTemplate({ sport_code: 'akc-scent-work' }, AKC_FLAT_LEVELS);

    function renderWithChain(withChain: boolean) {
      progress.value = {
        progressBySport: {
          'akc-scent-work': computeTitleProgress([], buildAkcScentWorkTitles(withChain), akcLevels),
        },
        earnedAbbreviations: [],
        isLoading: false,
      };
      return render(<TitleProgressSection dogId="dog-1" />);
    }

    it('offers the first three elements at Novice, not one element at three levels', () => {
      renderWithChain(true);

      expect(screen.getByText('Scent Work Container Novice')).toBeInTheDocument();
      expect(screen.getByText('Scent Work Interior Novice')).toBeInTheDocument();
      expect(screen.getByText('Scent Work Exterior Novice')).toBeInTheDocument();
      expect(screen.queryByText('Scent Work Container Advanced')).not.toBeInTheDocument();
      expect(screen.queryByText('Scent Work Container Excellent')).not.toBeInTheDocument();
      expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    });

    it('showed one element at three levels before the chain was seeded', () => {
      // Pre-migration data, kept as the positive control for the case above.
      renderWithChain(false);

      expect(screen.getByText('Scent Work Container Novice')).toBeInTheDocument();
      expect(screen.getByText('Scent Work Container Advanced')).toBeInTheDocument();
      expect(screen.getByText('Scent Work Container Excellent')).toBeInTheDocument();
    });
  });
});
