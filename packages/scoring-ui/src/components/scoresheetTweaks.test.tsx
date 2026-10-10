/**
 * MYK9-1086 scoresheet tweaks: wider armband with breed, judge in the header
 * line, and a labelled reset that only appears for a stopped time.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoresheetDogCard } from './ScoresheetDogCard';
import { TimerResetButton } from './TimerResetButton';
import { formatScoresheetSubtitle } from '../utils/scoresheetSubtitle';

describe('ScoresheetDogCard', () => {
  it('shows armband, call name, breed and handler', () => {
    render(
      <ScoresheetDogCard
        armband={1204}
        dogName="Cooper"
        breed="Beagle"
        handlerName="Jordan Ellis"
      />
    );
    expect(screen.getByTestId('scoresheet-armband').textContent).toBe('1204');
    expect(screen.getByText('Beagle')).toBeTruthy();
    expect(screen.getByText('Handler: Jordan Ellis')).toBeTruthy();
  });

  it('lets the armband badge grow with its digits', () => {
    render(<ScoresheetDogCard armband={1204} dogName="Cooper" handlerName="Jordan" />);
    const badge = screen.getByTestId('scoresheet-armband');
    expect(badge.className).toContain('min-w-');
    expect(badge.className).not.toMatch(/\bw-14\b/);
  });
});

describe('formatScoresheetSubtitle', () => {
  it('adds the judge after the class', () => {
    expect(
      formatScoresheetSubtitle({ element: 'Container', level: 'Novice', judgeName: 'Pat Lee' })
    ).toBe('Container Novice · Judge Pat Lee');
  });

  it('drops an Unknown level and a missing judge', () => {
    expect(formatScoresheetSubtitle({ element: 'Interior', level: 'Unknown' })).toBe('Interior');
  });
});

describe('TimerResetButton', () => {
  it('renders nothing when there is no stopped time', () => {
    render(<TimerResetButton visible={false} onReset={vi.fn()} />);
    expect(screen.queryByTestId('timer-reset')).toBeNull();
  });

  it('is a labelled button that resets', () => {
    const onReset = vi.fn();
    render(<TimerResetButton visible onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
