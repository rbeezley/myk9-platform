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

  it('renders fallback when no nextUp', () => {
    render(<ShowDayHero data={makeData({ nextUp: null })} />);
    expect(screen.queryByText('Next Up')).not.toBeInTheDocument();
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
