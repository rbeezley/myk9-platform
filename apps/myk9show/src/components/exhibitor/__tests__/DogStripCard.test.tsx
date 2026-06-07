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
      <DogStripCard
        dogId="d1"
        dogName="Rosie"
        breed={['German Shepherd']}
        upcomingClassCount={2}
      />
    );
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getByText('German Shepherd')).toBeInTheDocument();
  });

  it('shows green upcoming classes badge when upcomingClassCount > 0', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" breed={['GSD']} upcomingClassCount={2} />);
    expect(screen.getByText('2 upcoming classes')).toBeInTheDocument();
  });

  it('uses singular copy for one upcoming class', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" breed={['GSD']} upcomingClassCount={1} />);
    expect(screen.getByText('1 upcoming class')).toBeInTheDocument();
  });

  it('shows amber Not entered badge when upcomingClassCount is 0', () => {
    render(<DogStripCard dogId="d1" dogName="Max" breed={['BC']} upcomingClassCount={0} />);
    expect(screen.getByText('Not entered')).toBeInTheDocument();
  });

  it('shows title abbreviations when earned', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" breed={['GSD']} upcomingClassCount={1} />);
    expect(screen.getByText('SWN, SWA')).toBeInTheDocument();
  });
});
