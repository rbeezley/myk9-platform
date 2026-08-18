import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogStrip } from '../DogStrip';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: [], isLoading: false }),
}));

const dogs = [
  { id: 'd1', call_name: 'Rosie', breed: 'German Shepherd' },
  { id: 'd2', call_name: 'Max', breed: 'Border Collie' },
];

describe('DogStrip', () => {
  it('renders a card for each dog', () => {
    render(<DogStrip dogs={dogs} upcomingClassCountByDog={{ d1: 2 }} />);
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows upcoming class count for dog with future class entries', () => {
    render(<DogStrip dogs={dogs} upcomingClassCountByDog={{ d1: 2 }} />);
    expect(screen.getByText('2 upcoming classes')).toBeInTheDocument();
  });

  it('shows Not entered for dog with no future classes', () => {
    render(<DogStrip dogs={dogs} upcomingClassCountByDog={{ d1: 2 }} />);
    expect(screen.getByText('Not entered')).toBeInTheDocument();
  });

  it('renders nothing when dogs array is empty', () => {
    const { container } = render(<DogStrip dogs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Add Dog button', () => {
    render(<DogStrip dogs={dogs} upcomingClassCountByDog={{ d1: 2 }} />);
    expect(screen.getByText('New Dog')).toBeInTheDocument();
  });

  /**
   * MYK9-124. The New Dog control used to be the LAST child of the horizontal
   * rail, after every dog card. Cards are `w-52` (208px) plus a 12px gap, and
   * the content column is ~672px at 150-200% browser zoom, so only three items
   * fit — which puts New Dog off-screen for any exhibitor with three or more
   * dogs. The rail carries `hide-scrollbar`, so there was no scrollbar to
   * reveal it either; only a faint edge fade.
   *
   * Keeping a primary action inside an unbounded scroller makes its
   * reachability a function of how many dogs someone owns. It belongs in the
   * section header, where it is visible at every zoom level and every count.
   *
   * jsdom does no layout, so this asserts the structural property that makes
   * the layout property true.
   */
  it('keeps the New Dog action out of the horizontal scroller', () => {
    render(<DogStrip dogs={dogs} upcomingClassCountByDog={{ d1: 2 }} />);

    const newDog = screen.getByRole('button', { name: /new dog/i });
    const rail = newDog.closest('.overflow-x-auto');

    expect(
      rail,
      'New Dog must not live inside the scrolling rail — with 3+ dogs at 150% ' +
        'zoom it scrolls out of view behind a hidden scrollbar'
    ).toBeNull();
  });

  it('still reaches the New Dog action when the strip is long', async () => {
    const manyDogs = Array.from({ length: 20 }, (_, i) => ({
      id: `d${i}`,
      call_name: `Dog ${i}`,
      breed: 'Mixed',
    }));
    const onAddDog = vi.fn();
    const { user } = render(<DogStrip dogs={manyDogs} onAddDog={onAddDog} />);

    await user.click(screen.getByRole('button', { name: /new dog/i }));
    expect(onAddDog).toHaveBeenCalledOnce();
  });
});
