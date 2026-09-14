import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import TitleProgressSection from '../TitleProgressSection';

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
});
