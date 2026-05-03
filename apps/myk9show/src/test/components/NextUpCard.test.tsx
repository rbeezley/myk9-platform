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
    ringNumber: null,
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
    // Component now has multiple buttons; click the content area button (has aria-label)
    const contentButton = screen.getByLabelText(/Next up: Container Novice A/);
    await user.click(contentButton);
    expect(onNavigate).toHaveBeenCalledWith('class-1');
  });

  it('has accessible aria-label on content button', () => {
    render(<NextUpCard classData={makeClass()} />);
    const contentButton = screen.getByLabelText(/Next up: Container Novice A/);
    expect(contentButton).toBeInTheDocument();
  });

  it('renders dog position in class', () => {
    render(<NextUpCard classData={makeClass({ scoredEntries: 5, totalEntries: 12 })} />);
    expect(screen.getByText(/Dog 6 of 12/)).toBeInTheDocument();
  });

  // --- Phase 4: No scoring data graceful degradation ---

  it('shows entry count and ring when no scoring data', () => {
    render(
      <NextUpCard
        classData={makeClass({
          scoredEntries: 0,
          currentDogInRing: null,
          totalEntries: 8,
          ringNumber: 3,
        })}
      />
    );
    expect(screen.getByText(/8 entries/)).toBeInTheDocument();
    expect(screen.getByText(/Ring 3/)).toBeInTheDocument();
    expect(screen.queryByText(/Dog \d+ of/)).not.toBeInTheDocument();
  });

  it('hides progress bar when no scoring data', () => {
    render(
      <NextUpCard
        classData={makeClass({
          scoredEntries: 0,
          currentDogInRing: null,
        })}
      />
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows progress bar when scoring data exists', () => {
    render(
      <NextUpCard
        classData={makeClass({
          scoredEntries: 3,
          totalEntries: 12,
        })}
      />
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows singular "entry" for 1 entry with no scoring', () => {
    render(
      <NextUpCard
        classData={makeClass({
          scoredEntries: 0,
          currentDogInRing: null,
          totalEntries: 1,
        })}
      />
    );
    expect(screen.getByText(/1 entry/)).toBeInTheDocument();
  });

  // --- Phase 4: Accessibility ---

  it('has aria-disabled on check-in button when self-check-in is off', () => {
    render(
      <NextUpCard
        classData={makeClass({ entryStatus: 'no-status' })}
        onCheckInChange={vi.fn()}
        selfCheckinEnabled={false}
      />
    );
    const button = screen.getByLabelText(/check-in disabled/i);
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  // --- Dogs ahead countdown ---

  it('shows "X dogs ahead" when multiple dogs are ahead', () => {
    // default fixture: myRunningOrder=8, scoredEntries=5 → dogsAhead=2
    render(<NextUpCard classData={makeClass()} />);
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
  });

  it('shows "1 dog ahead" when exactly one dog is ahead', () => {
    // myRunningOrder=7, scoredEntries=5 → dogsAhead=1
    render(<NextUpCard classData={makeClass({ myRunningOrder: 7, scoredEntries: 5 })} />);
    expect(screen.getByText('1 dog ahead')).toBeInTheDocument();
  });

  it('shows "You\'re next" when no dogs are ahead', () => {
    // myRunningOrder=6, scoredEntries=5 → dogsAhead=0
    render(<NextUpCard classData={makeClass({ myRunningOrder: 6, scoredEntries: 5 })} />);
    expect(screen.getByText("You're next")).toBeInTheDocument();
  });

  it('hides dogs-ahead when entry is scored', () => {
    render(<NextUpCard classData={makeClass({ isScored: true })} />);
    expect(screen.queryByText(/dogs ahead|You're next/)).not.toBeInTheDocument();
  });

  it('renders Manage button when onManage is provided', () => {
    const onManage = vi.fn();
    render(<NextUpCard classData={makeClass({ entryStatus: 'no-status' })} onManage={onManage} />);
    expect(screen.getByRole('button', { name: /manage check.in/i })).toBeInTheDocument();
  });

  it('does not render Manage button when onManage is omitted', () => {
    render(<NextUpCard classData={makeClass({ entryStatus: 'no-status' })} />);
    expect(screen.queryByRole('button', { name: /manage check.in/i })).not.toBeInTheDocument();
  });

  it('calls onManage with entryId when Manage button is clicked', async () => {
    const onManage = vi.fn();
    render(
      <NextUpCard
        classData={makeClass({ entryId: 'entry-42', entryStatus: 'no-status' })}
        onManage={onManage}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /manage check.in/i }));
    expect(onManage).toHaveBeenCalledWith('entry-42');
  });
});
