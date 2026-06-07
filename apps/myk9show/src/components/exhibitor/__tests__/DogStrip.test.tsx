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
});
