/**
 * MYK9-1086 review: the card is the scoring action once the Score button is
 * gone, so it must work from a keyboard / switch control.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DogCard } from './DogCard';

describe('DogCard keyboard activation', () => {
  it('is a focusable button that activates on Enter and Space', () => {
    const onClick = vi.fn();
    render(
      <DogCard armband={201} callName="Cooper" breed="Beagle" handler="Jordan" onClick={onClick} />
    );
    const card = screen.getByRole('button', { name: 'Cooper, armband 201' });
    expect(card.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('is not a button when it has no action', () => {
    render(<DogCard armband={201} callName="Cooper" breed="Beagle" handler="Jordan" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
