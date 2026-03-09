import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassTimelineCard } from '@/components/exhibitor/ClassTimelineCard';
import type { ShowDayClass } from '@/types/show-day-types';

function makeClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Interior Advanced B',
    element: 'Interior',
    level: 'Advanced',
    dogCallName: 'Luna',
    dogId: 'dog-2',
    armband: '175',
    entryId: 'entry-2',
    totalEntries: 20,
    scoredEntries: 8,
    currentDogInRing: null,
    myRunningOrder: 15,
    estimatedTimeMinutes: 21,
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

describe('ClassTimelineCard', () => {
  it('renders class label and dog name', () => {
    render(<ClassTimelineCard classData={makeClass()} />);
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
  });

  it('renders armband number', () => {
    render(<ClassTimelineCard classData={makeClass()} />);
    expect(screen.getByText(/#175/)).toBeInTheDocument();
  });

  it('renders estimated time for upcoming classes', () => {
    render(<ClassTimelineCard classData={makeClass()} />);
    expect(screen.getByText('~21m')).toBeInTheDocument();
  });

  it('renders result badge for completed classes', () => {
    render(
      <ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'qualified' })} />
    );
    expect(screen.getByText('Q')).toBeInTheDocument();
  });

  it('renders NQ badge for non-qualifying result', () => {
    render(<ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'nq' })} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  it('applies muted styling for completed classes', () => {
    render(
      <ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'qualified' })} />
    );
    const button = screen.getByRole('button');
    expect(button.className).toContain('opacity-70');
  });

  it('shows strikethrough on completed class name', () => {
    render(
      <ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'qualified' })} />
    );
    const label = screen.getByText('Interior Advanced');
    expect(label.className).toContain('line-through');
  });

  it('does not show strikethrough on upcoming class', () => {
    render(<ClassTimelineCard classData={makeClass()} />);
    const label = screen.getByText('Interior Advanced');
    expect(label.className).not.toContain('line-through');
  });

  it('calls onNavigate with classId on click', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ClassTimelineCard classData={makeClass()} onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button'));
    expect(onNavigate).toHaveBeenCalledWith('class-1');
  });

  it('falls back to className when element/level are null', () => {
    render(<ClassTimelineCard classData={makeClass({ element: null, level: null })} />);
    expect(screen.getByText('Interior Advanced B')).toBeInTheDocument();
  });

  // --- Phase 4: Accessibility ---

  it('status indicator has aria-label "Completed" for scored classes', () => {
    const { container } = render(
      <ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'qualified' })} />
    );
    const statusIndicator = container.querySelector('[role="img"]');
    expect(statusIndicator).toBeInTheDocument();
    expect(statusIndicator?.getAttribute('aria-label')).toBe('Completed');
  });

  it('status indicator has aria-label "Pending" for upcoming classes', () => {
    const { container } = render(<ClassTimelineCard classData={makeClass()} />);
    const statusIndicator = container.querySelector('[role="img"]');
    expect(statusIndicator).toBeInTheDocument();
    expect(statusIndicator?.getAttribute('aria-label')).toBe('Pending');
  });

  it('handles no estimated time gracefully', () => {
    render(<ClassTimelineCard classData={makeClass({ estimatedTimeMinutes: null })} />);
    expect(screen.queryByText(/~\d+m/)).not.toBeInTheDocument();
  });

  it('handles no armband gracefully', () => {
    render(<ClassTimelineCard classData={makeClass({ armband: null })} />);
    expect(screen.queryByText(/#/)).not.toBeInTheDocument();
  });

  it('shows check circle icon for completed classes', () => {
    const { container } = render(
      <ClassTimelineCard classData={makeClass({ isScored: true, resultStatus: 'qualified' })} />
    );
    // CheckCircle SVG should be present
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
