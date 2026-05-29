/**
 * Smoke tests for the ringside `DogCard`.
 *
 * Post-Tailwind-migration: the card is styled with Tailwind utilities (no
 * scoped `.dog-card` CSS), so tests key off stable `data-testid` hooks
 * (`dog-card`, `dog-card-armband`, `section-badge`) + rendered text + the
 * behavior-bearing utility classes (status left-border, is-long text size,
 * touchable cursor), not internal class names. Vanilla vitest assertions.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DogCard } from './DogCard';

describe('DogCard', () => {
  it('renders the dog identity + armband', () => {
    render(
      <DogCard armband={105} callName="Tauri" breed="Australian Shepherd" handler="Jane Handler" />
    );
    expect(screen.getByText('Tauri')).toBeTruthy();
    expect(screen.getByText('Australian Shepherd')).toBeTruthy();
    expect(screen.getByText('Jane Handler')).toBeTruthy();
    const armband = screen.getByTestId('dog-card-armband');
    expect(armband.textContent).toBe('105');
    // Short armband: full-size text, not the is-long shrink.
    expect(armband.className).toContain('text-lg');
    expect(armband.className).not.toContain('text-[0.9375rem]');
  });

  it('applies the status left-border to the card', () => {
    render(<DogCard armband={1} callName="A" breed="B" handler="C" statusBorder="checked-in" />);
    expect(screen.getByTestId('dog-card').className).toContain('border-l-status-checked-in');
  });

  it('marks 4+ digit armbands as long (smaller text)', () => {
    render(<DogCard armband={1234} callName="A" breed="B" handler="C" />);
    expect(screen.getByTestId('dog-card-armband').className).toContain('text-[0.9375rem]');
  });

  it('renders the section corner badge', () => {
    render(<DogCard armband={1} callName="A" breed="B" handler="C" sectionBadge="B" />);
    expect(screen.getByTestId('section-badge').textContent).toBe('B');
  });

  it('renders injected action + result-badge slots', () => {
    render(
      <DogCard
        armband={1}
        callName="A"
        breed="B"
        handler="C"
        actionButton={<span data-testid="status">In Ring</span>}
        resultBadges={<span data-testid="badges">NQ</span>}
      />
    );
    expect(screen.getByTestId('status')).toBeTruthy();
    expect(screen.getByTestId('badges')).toBeTruthy();
  });

  it('is touchable + fires onClick / onPrefetch when interactive', () => {
    const onClick = vi.fn();
    const onPrefetch = vi.fn();
    render(
      <DogCard
        armband={1}
        callName="A"
        breed="B"
        handler="C"
        onClick={onClick}
        onPrefetch={onPrefetch}
      />
    );
    const card = screen.getByTestId('dog-card');
    expect(card.className).toContain('cursor-pointer');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.mouseEnter(card);
    expect(onPrefetch).toHaveBeenCalled();
  });
});
