/**
 * MYK9-1086 review: the card is the scoring tap target, but it must not become
 * a button wrapping other buttons. Keyboard users get a real Score button
 * (see SortableEntryCard), and the card itself stays a plain container.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DogCard } from './DogCard';

describe('DogCard', () => {
  it('is not itself a button, even with a tap action', () => {
    render(
      <DogCard
        armband={201}
        callName="Cooper"
        breed="Beagle"
        handler="Jordan"
        onClick={vi.fn()}
        trailing={<button type="button">Check-in</button>}
      />
    );
    expect(screen.getByTestId('dog-card').getAttribute('role')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
