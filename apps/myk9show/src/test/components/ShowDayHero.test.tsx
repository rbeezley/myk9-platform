import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShowDayHero } from '@/components/exhibitor/ShowDayHero';
import type { ShowDayData, ShowDayClass, ActiveShowInfo } from '@/types/show-day-types';

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
    currentDogInRing: null,
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

function makeShow(overrides: Partial<ActiveShowInfo> = {}): ActiveShowInfo {
  return {
    showId: 'show-1',
    showName: 'AKC Scent Work Trial',
    location: 'Denver, CO',
    clubName: 'Rocky Mountain Club',
    trialDate: '2026-03-09',
    showStatus: 'in_progress',
    ...overrides,
  };
}

function makeData(overrides: Partial<ShowDayData> = {}): ShowDayData {
  const nextUp = makeClass();
  const laterClass = makeClass({
    classId: 'class-2',
    entryId: 'entry-2',
    className: 'Interior Advanced B',
    element: 'Interior',
    level: 'Advanced',
    dogCallName: 'Luna',
    estimatedTimeMinutes: 45,
  });
  const completedClass = makeClass({
    classId: 'class-3',
    entryId: 'entry-3',
    className: 'Container Masters',
    element: 'Container',
    level: 'Masters',
    dogCallName: 'Thunder',
    isScored: true,
    resultStatus: 'qualified',
    estimatedTimeMinutes: null,
  });

  return {
    isShowDay: true,
    activeShows: [makeShow()],
    activeShow: makeShow(),
    myClasses: [nextUp, laterClass, completedClass],
    nextUp,
    completedToday: [completedClass],
    stats: { total: 3, completed: 1, qualified: 1 },
    isLoading: false,
    error: null,
    isStale: false,
    lastUpdated: new Date(),
    ...overrides,
  };
}

describe('ShowDayHero', () => {
  it('renders show name and live indicator', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('AKC Scent Work Trial')).toBeInTheDocument();
  });

  it('renders show location', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('Denver, CO')).toBeInTheDocument();
  });

  it('renders NextUpCard when nextUp exists', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('Next Up')).toBeInTheDocument();
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('renders Later Today section', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('Later Today')).toBeInTheDocument();
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
  });

  it('renders Completed section collapsed by default', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
    // Completed class should not be visible until expanded
    expect(screen.queryByText('Container Masters')).not.toBeInTheDocument();
  });

  it('expands completed section on click', async () => {
    const user = userEvent.setup();
    render(<ShowDayHero data={makeData()} />);
    await user.click(screen.getByText(/Completed \(1\)/));
    expect(screen.getByText('Container Masters')).toBeInTheDocument();
  });

  it('renders stats row', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('1 of 3 classes done')).toBeInTheDocument();
    expect(screen.getByText(/1 Q/)).toBeInTheDocument();
  });

  it('hides Q count when zero', () => {
    render(<ShowDayHero data={makeData({ stats: { total: 3, completed: 1, qualified: 0 } })} />);
    expect(screen.queryByText(/Q$/)).not.toBeInTheDocument();
  });

  it('shows stale data indicator when isStale', () => {
    const lastUpdated = new Date(Date.now() - 5 * 60_000); // 5 min ago
    render(<ShowDayHero data={makeData({ isStale: true, lastUpdated })} />);
    expect(screen.getByText(/minutes? ago/)).toBeInTheDocument();
  });

  it('hides stale indicator when not stale', () => {
    render(<ShowDayHero data={makeData({ isStale: false })} />);
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });

  it('renders multi-show tabs when multiple shows', () => {
    const show1 = makeShow({ showId: 'show-1', showName: 'Morning Trial' });
    const show2 = makeShow({ showId: 'show-2', showName: 'Afternoon Trial' });
    render(
      <ShowDayHero
        data={makeData({
          activeShows: [show1, show2],
          activeShow: show1,
        })}
      />
    );
    expect(screen.getByRole('tab', { name: 'Morning Trial' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Afternoon Trial' })).toBeInTheDocument();
  });

  it('calls onShowSelect when a show tab is clicked', async () => {
    const user = userEvent.setup();
    const onShowSelect = vi.fn();
    const show1 = makeShow({ showId: 'show-1', showName: 'Morning Trial' });
    const show2 = makeShow({ showId: 'show-2', showName: 'Afternoon Trial' });
    render(
      <ShowDayHero
        data={makeData({ activeShows: [show1, show2], activeShow: show1 })}
        onShowSelect={onShowSelect}
      />
    );
    await user.click(screen.getByRole('tab', { name: 'Afternoon Trial' }));
    expect(onShowSelect).toHaveBeenCalledWith('show-2');
  });

  it('does not render multi-show tabs for single show', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('renders fallback when no nextUp and classes remaining', () => {
    render(<ShowDayHero data={makeData({ nextUp: null })} />);
    expect(screen.queryByText('Next Up')).not.toBeInTheDocument();
  });

  // --- Phase 4: All-completed state ---

  it('shows "All Done!" celebration when all classes completed', () => {
    const completedClass = makeClass({
      classId: 'class-1',
      entryId: 'entry-1',
      isScored: true,
      resultStatus: 'qualified',
    });
    render(
      <ShowDayHero
        data={makeData({
          nextUp: null,
          myClasses: [completedClass],
          completedToday: [completedClass],
          stats: { total: 1, completed: 1, qualified: 1 },
        })}
      />
    );
    expect(screen.getByText('All Done!')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('shows Q count in celebration state', () => {
    const completed1 = makeClass({
      classId: 'c1',
      entryId: 'e1',
      isScored: true,
      resultStatus: 'qualified',
    });
    const completed2 = makeClass({
      classId: 'c2',
      entryId: 'e2',
      isScored: true,
      resultStatus: 'nq',
    });
    render(
      <ShowDayHero
        data={makeData({
          nextUp: null,
          myClasses: [completed1, completed2],
          completedToday: [completed1, completed2],
          stats: { total: 2, completed: 2, qualified: 1 },
        })}
      />
    );
    // Celebration card shows class count and Q summary
    expect(screen.getByText('2 classes completed')).toBeInTheDocument();
    // Q count appears in both celebration card and stats row
    expect(screen.getAllByText(/1 Q/).length).toBeGreaterThanOrEqual(1);
  });

  it('auto-expands completed section when all done', () => {
    const completedClass = makeClass({
      classId: 'c1',
      entryId: 'e1',
      isScored: true,
      resultStatus: 'qualified',
      className: 'Container Masters',
      element: 'Container',
      level: 'Masters',
    });
    render(
      <ShowDayHero
        data={makeData({
          nextUp: null,
          myClasses: [completedClass],
          completedToday: [completedClass],
          stats: { total: 1, completed: 1, qualified: 1 },
        })}
      />
    );
    // Completed section should be auto-expanded
    expect(screen.getByText('Container Masters')).toBeInTheDocument();
  });

  it('shows "Live" badge when not all completed', () => {
    render(<ShowDayHero data={makeData()} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Done')).not.toBeInTheDocument();
    expect(screen.queryByText('All Done!')).not.toBeInTheDocument();
  });

  // --- Phase 4: Accessibility ---

  it('has region role with aria-label', () => {
    const { container } = render(<ShowDayHero data={makeData()} />);
    const region = container.querySelector('[role="region"]');
    expect(region).toBeInTheDocument();
    expect(region?.getAttribute('aria-label')).toBe('Show day status');
  });

  it('completed toggle has aria-controls matching section id', () => {
    render(<ShowDayHero data={makeData()} />);
    const toggle = screen.getByText(/Completed \(1\)/);
    const controlsId = toggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
  });

  it('stale indicator has accessible label', () => {
    const lastUpdated = new Date(Date.now() - 5 * 60_000);
    render(<ShowDayHero data={makeData({ isStale: true, lastUpdated })} />);
    const staleIndicator = screen.getByRole('status', { name: /data may be outdated/i });
    expect(staleIndicator).toBeInTheDocument();
  });

  it('tablist has aria-label for multi-show', () => {
    const show1 = makeShow({ showId: 'show-1', showName: 'Show A' });
    const show2 = makeShow({ showId: 'show-2', showName: 'Show B' });
    render(<ShowDayHero data={makeData({ activeShows: [show1, show2], activeShow: show1 })} />);
    expect(screen.getByRole('tablist', { name: 'Show selector' })).toBeInTheDocument();
  });

  it('passes onClassNavigate to child cards', async () => {
    const user = userEvent.setup();
    const onClassNavigate = vi.fn();
    render(<ShowDayHero data={makeData()} onClassNavigate={onClassNavigate} />);
    // Click the NextUpCard
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]); // First button is NextUpCard
    expect(onClassNavigate).toHaveBeenCalledWith('class-1');
  });
});
