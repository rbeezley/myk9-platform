import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import AboutCard from './AboutCard';

describe('AboutCard', () => {
  it('hides invalid measurements instead of showing NaN', () => {
    const dog = {
      id: 'dog-1',
      name: 'Maple',
      breed: 'Golden Retriever',
      sex: 'female',
      ownerId: 'owner-1',
      height: 'NaN',
      weight: 'NaN',
    } satisfies Dog;

    render(<AboutCard dog={dog} />);

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText('Height')).not.toBeInTheDocument();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  });

  it('hides blank measurements instead of showing zero', () => {
    const dog = {
      id: 'dog-1',
      name: 'Maple',
      breed: 'Golden Retriever',
      sex: 'female',
      ownerId: 'owner-1',
      height: '',
      weight: '   ',
    } satisfies Dog;

    render(<AboutCard dog={dog} />);

    expect(screen.queryByText('0"')).not.toBeInTheDocument();
    expect(screen.queryByText('0 lbs')).not.toBeInTheDocument();
    expect(screen.queryByText('Height')).not.toBeInTheDocument();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  });

  // This card is the SECOND call site of the shared `formatDogAge`, and the
  // premise of adopting it here was "one date of birth cannot read two ways".
  // The card's own output genuinely changed, so it needs its own assertions —
  // the My Dogs card's tests cannot see a regression in this file.
  describe('age', () => {
    const base = {
      id: 'dog-1',
      name: 'Maple',
      breed: 'Golden Retriever',
      sex: 'female',
      ownerId: 'owner-1',
    } satisfies Dog;

    function daysAgo(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() - days);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    }

    it('renders the age in years for an adult dog', () => {
      render(<AboutCard dog={{ ...base, dateOfBirth: daysAgo(365 * 3 + 10) }} />);

      expect(screen.getByText('Age')).toBeInTheDocument();
      expect(screen.getByText('3 yrs old')).toBeInTheDocument();
    });

    // The reason this card was switched to the shared formatter: its own copy
    // divided by 365.25 and rendered a puppy as "0 yrs old".
    it('renders a puppy in months rather than as zero years', () => {
      render(<AboutCard dog={{ ...base, dateOfBirth: daysAgo(100) }} />);

      expect(screen.getByText('3 mos old')).toBeInTheDocument();
      expect(screen.queryByText('0 yrs old')).not.toBeInTheDocument();
    });

    it('hides the row entirely when no date of birth is recorded', () => {
      render(<AboutCard dog={base} />);

      expect(screen.queryByText('Age')).not.toBeInTheDocument();
    });

    it('hides the row rather than reporting a future date of birth as a newborn', () => {
      render(<AboutCard dog={{ ...base, dateOfBirth: daysAgo(-30) }} />);

      expect(screen.queryByText('Age')).not.toBeInTheDocument();
    });
  });
});
