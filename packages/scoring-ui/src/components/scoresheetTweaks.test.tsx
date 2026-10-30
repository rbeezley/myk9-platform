/**
 * MYK9-1086 scoresheet tweaks: wider armband with breed, judge in the header
 * line, and a labelled reset that only appears for a stopped time.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoresheetHeader } from './ScoresheetHeader';
import { TimerResetButton } from './TimerResetButton';
import { formatScoresheetSubtitle } from '../utils/scoresheetSubtitle';
import { resultLabel } from '../utils/resultLabel';

const header = {
  upButton: <button type="button">Entries</button>,
  titleLines: ['AKC Scent Work'],
  handlerName: 'Jordan Ellis',
  dogName: 'Cooper',
  armband: 1204,
};

describe('ScoresheetHeader', () => {
  it('shows armband, call name, breed and handler', () => {
    render(<ScoresheetHeader {...header} breed="Beagle" />);
    expect(screen.getByTestId('scoresheet-armband').textContent).toBe('1204');
    expect(screen.getByText('Cooper')).toBeTruthy();
    expect(screen.getByText('Beagle')).toBeTruthy();
    expect(screen.getByText('Handler: Jordan Ellis')).toBeTruthy();
  });

  it('lets the armband badge grow with its digits', () => {
    render(<ScoresheetHeader {...header} />);
    const badge = screen.getByTestId('scoresheet-armband');
    expect(badge.className).toContain('min-w-');
    expect(badge.className).not.toMatch(/\bw-14\b/);
  });

  it('puts the Up control first and the host actions last', () => {
    render(<ScoresheetHeader {...header} headerActions={<button type="button">Mute</button>} />);
    const banner = screen.getByRole('banner');
    expect(banner.firstElementChild).toBe(screen.getByRole('button', { name: 'Entries' }));
    expect(banner.lastElementChild).toBe(screen.getByRole('button', { name: 'Mute' }));
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

describe('resultLabel', () => {
  it('spells every result code out in words', () => {
    expect(['Q', 'NQ', 'ABS', 'EX', 'DQ'].map(resultLabel)).toEqual([
      'Qualified',
      'NQ',
      'Absent',
      'Excused',
      'DQ',
    ]);
    expect(resultLabel('1st')).toBe('1st');
    expect(resultLabel(null)).toBe('');
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
