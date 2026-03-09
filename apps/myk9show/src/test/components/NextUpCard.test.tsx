import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextUpCard } from '@/components/exhibitor/NextUpCard';
import type { ShowDayClass } from '@/types/show-day-types';

function makeClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    dogCallName: 'Storm',
    dogId: 'dog-1',
    armband: '160',
    entryId: 'entry-1',
    totalEntries: 12,
    scoredEntries: 5,
    currentDogInRing: 'Katie',
    myRunningOrder: 8,
    estimatedTimeMinutes: 9,
    entryStatus: 'checked-in',
    isScored: false,
    resultStatus: null,
    classStatus: 'in-progress',
    showId: 'show-1',
    showName: 'AKC Scent Work',
    trialDate: '2026-03-09',
    ...overrides,
  };
}

describe('NextUpCard', () => {
  it('renders class label from element + level', () => {
    render(<NextUpCard classData={makeClass()} />);
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('falls back to className when element/level are null', () => {
    render(<NextUpCard classData={makeClass({ element: null, level: null })} />);
    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
  });

  it('renders dog name and armband', () => {
    render(<NextUpCard classData={makeClass()} />);
    expect(screen.getByText(/Storm/)).toBeInTheDocument();
    expect(screen.getByText(/Armband #160/)).toBeInTheDocument();
  });

  it('renders estimated time', () => {
    render(<NextUpCard classData={makeClass()} />);
    expect(screen.getByText('~9 min')).toBeInTheDocument();
  });

  it('hides estimated time when null', () => {
    render(<NextUpCard classData={makeClass({ estimatedTimeMinutes: null })} />);
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it('renders progress bar with correct percentage', () => {
    render(<NextUpCard classData={makeClass({ scoredEntries: 6, totalEntries: 12 })} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows 0% when totalEntries is 0', () => {
    render(<NextUpCard classData={makeClass({ scoredEntries: 0, totalEntries: 0 })} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows current dog in ring', () => {
    render(<NextUpCard classData={makeClass({ currentDogInRing: 'Luna' })} />);
    expect(screen.getByText(/Luna in ring/)).toBeInTheDocument();
  });

  it('hides current dog when null', () => {
    render(<NextUpCard classData={makeClass({ currentDogInRing: null })} />);
    expect(screen.queryByText(/in ring/)).not.toBeInTheDocument();
  });

  it('calls onNavigate with classId on click', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<NextUpCard classData={makeClass()} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('class-1');
  });

  it('has accessible aria-label', () => {
    render(<NextUpCard classData={makeClass()} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Next up: Container Novice A')
    );
  });

  it('renders dog position in class', () => {
    render(<NextUpCard classData={makeClass({ scoredEntries: 5, totalEntries: 12 })} />);
    expect(screen.getByText(/Dog 6 of 12/)).toBeInTheDocument();
  });
});
