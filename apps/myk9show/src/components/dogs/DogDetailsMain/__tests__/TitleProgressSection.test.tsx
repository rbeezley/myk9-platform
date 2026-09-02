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
});
