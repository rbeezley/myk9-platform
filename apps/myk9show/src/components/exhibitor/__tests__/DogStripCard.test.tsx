import { describe, it, expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogStripCard } from '../DogStripCard';

vi.mock('@/hooks/useTitleProgress', () => ({
  useTitleProgress: () => ({ earnedAbbreviations: ['SWN', 'SWA'], isLoading: false }),
}));

const sameBreed = [
  { organization: 'AKC', breed: 'German Shepherd', registration_number: 'DN1' },
  { organization: 'UKC', breed: 'German Shepherd', registration_number: 'R2' },
];

describe('DogStripCard', () => {
  it('shows dog name and the breed once when registries agree', () => {
    render(
      <DogStripCard dogId="d1" dogName="Rosie" registrations={sameBreed} upcomingClassCount={2} />
    );
    expect(screen.getByText('Rosie')).toBeInTheDocument();
    expect(screen.getAllByText('German Shepherd')).toHaveLength(1);
  });

  it('lists a registration number per registry', () => {
    render(
      <DogStripCard dogId="d1" dogName="Rosie" registrations={sameBreed} upcomingClassCount={2} />
    );
    expect(screen.getByText('AKC')).toBeInTheDocument();
    expect(screen.getByText('DN1')).toBeInTheDocument();
    expect(screen.getByText('UKC')).toBeInTheDocument();
    expect(screen.getByText('R2')).toBeInTheDocument();
  });

  it('shows each breed on its registry row when they differ', () => {
    render(
      <DogStripCard
        dogId="d1"
        dogName="Scout"
        registrations={[
          { organization: 'AKC', breed: 'All-American Dog', registration_number: 'PAL1' },
          { organization: 'UKC', breed: 'Mixed Breed', registration_number: 'P7' },
        ]}
        upcomingClassCount={1}
      />
    );
    expect(screen.getByText('Breed varies by registry')).toBeInTheDocument();
    expect(screen.getByText('All-American Dog')).toBeInTheDocument();
    expect(screen.getByText('Mixed Breed')).toBeInTheDocument();
  });

  it('shows date of birth with age', () => {
    render(
      <DogStripCard
        dogId="d1"
        dogName="Rosie"
        dateOfBirth="2021-03-14"
        registrations={sameBreed}
        upcomingClassCount={2}
      />
    );
    expect(screen.getByText(/^Born 3\/14\/2021 · \d+ yrs old$/)).toBeInTheDocument();
  });

  it('renders the photo when the dog has one, else an initial', () => {
    const { unmount } = render(
      <DogStripCard
        dogId="d1"
        dogName="Rosie"
        imageUrl="https://example.test/rosie.jpg"
        registrations={sameBreed}
        upcomingClassCount={2}
      />
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/rosie.jpg'
    );
    unmount();
    render(
      <DogStripCard dogId="d1" dogName="Rosie" registrations={sameBreed} upcomingClassCount={2} />
    );
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('shows green upcoming classes badge when upcomingClassCount > 0', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" registrations={[]} upcomingClassCount={2} />);
    expect(screen.getByText('2 upcoming classes')).toBeInTheDocument();
  });

  it('uses singular copy for one upcoming class', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" registrations={[]} upcomingClassCount={1} />);
    expect(screen.getByText('1 upcoming class')).toBeInTheDocument();
  });

  // MYK9-385: this badge is derived from the upcoming count alone, so it must
  // not make a claim about entered-ness — a dog whose show already ran has zero
  // upcoming classes and a full entry history.
  it('shows amber No upcoming classes badge when upcomingClassCount is 0', () => {
    render(<DogStripCard dogId="d1" dogName="Max" registrations={[]} upcomingClassCount={0} />);
    expect(screen.getByText('No upcoming classes')).toBeInTheDocument();
    expect(screen.queryByText('Not entered')).not.toBeInTheDocument();
  });

  it('shows title abbreviations when earned', () => {
    render(<DogStripCard dogId="d1" dogName="Rosie" registrations={[]} upcomingClassCount={1} />);
    act(() => screen.getByRole('button').focus());
    expect(screen.getByText('SWN, SWA')).toBeInTheDocument();
  });
});
