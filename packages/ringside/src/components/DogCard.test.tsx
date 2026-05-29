/**
 * Smoke tests for the ringside `DogCard` (Phase 1h-0).
 *
 * Locks the markup contract the ported myK9Q CSS targets: the status-border
 * class on `.dog-card`, the teal armband square (`.ringside-armband`, with the
 * `is-long` modifier for 4+ digit numbers), the section corner badge, the
 * injected slots (actionButton / resultBadges / dragHandle), and click/prefetch
 * wiring. Vanilla vitest assertions (no @testing-library/jest-dom in ringside).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DogCard } from './DogCard';

describe('DogCard', () => {
  it('renders the dog identity + armband', () => {
    const { container } = render(
      <DogCard armband={105} callName="Tauri" breed="Australian Shepherd" handler="Jane Handler" />
    );
    expect(screen.getByText('Tauri')).toBeTruthy();
    expect(screen.getByText('Australian Shepherd')).toBeTruthy();
    expect(screen.getByText('Jane Handler')).toBeTruthy();
    const armband = container.querySelector('.ringside-armband');
    expect(armband?.textContent).toBe('105');
    // Short armband: no is-long modifier.
    expect(container.querySelector('.ringside-armband.is-long')).toBeNull();
  });

  it('applies the status-border class to the card', () => {
    const { container } = render(
      <DogCard armband={1} callName="A" breed="B" handler="C" statusBorder="checked-in" />
    );
    expect(container.querySelector('.dog-card.checked-in')).toBeTruthy();
  });

  it('marks 4+ digit armbands as long (smaller text)', () => {
    const { container } = render(
      <DogCard armband={1234} callName="A" breed="B" handler="C" />
    );
    expect(container.querySelector('.ringside-armband.is-long')).toBeTruthy();
  });

  it('renders the section corner badge', () => {
    const { container } = render(
      <DogCard armband={1} callName="A" breed="B" handler="C" sectionBadge="B" />
    );
    const badge = container.querySelector('.section-badge.section-b');
    expect(badge?.textContent).toBe('B');
  });

  it('renders injected action + result-badge slots', () => {
    const { container } = render(
      <DogCard
        armband={1}
        callName="A"
        breed="B"
        handler="C"
        actionButton={<span data-testid="status">In Ring</span>}
        resultBadges={<span data-testid="badges">NQ</span>}
      />
    );
    expect(container.querySelector('.dog-card-action [data-testid="status"]')).toBeTruthy();
    expect(container.querySelector('.dog-card-results [data-testid="badges"]')).toBeTruthy();
  });

  it('is touchable + fires onClick / onPrefetch when interactive', () => {
    const onClick = vi.fn();
    const onPrefetch = vi.fn();
    const { container } = render(
      <DogCard
        armband={1}
        callName="A"
        breed="B"
        handler="C"
        onClick={onClick}
        onPrefetch={onPrefetch}
      />
    );
    const card = container.querySelector('.dog-card');
    expect(card?.classList.contains('touchable')).toBe(true);
    fireEvent.click(card!);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.mouseEnter(card!);
    expect(onPrefetch).toHaveBeenCalled();
  });
});
