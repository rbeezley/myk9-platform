import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogStripCard } from '../DogStripCard';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: ['SWN', 'SWA'], isLoading: false }),
}));

describe('DogStripCard', () => {
  it('shows dog name and breed', () => {
    render(
      <DogStripCard dogId="d1" dogName="Rosie" breed={['German Shepherd']} upcomingCount={2} />
    );
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getByText('German Shepherd')).toBeInTheDocument();
  });

  it('shows green upcoming badge when upcomingCount > 0', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" breed={['GSD']} upcomingCount={2} />);
    expect(screen.getByText('2 upcoming')).toBeInTheDocument();
  });

  it('shows amber Not entered badge when upcomingCount is 0', () => {
    render(<DogStripCard dogId="d1" dogName="Max" breed={['BC']} upcomingCount={0} />);
    expect(screen.getByText('Not entered')).toBeInTheDocument();
  });

  it('shows title abbreviations when earned', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" breed={['GSD']} upcomingCount={1} />);
    expect(screen.getByText('SWN, SWA')).toBeInTheDocument();
  });
});
