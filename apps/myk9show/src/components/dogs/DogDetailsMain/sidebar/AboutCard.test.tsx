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
});
