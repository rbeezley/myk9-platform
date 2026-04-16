import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { TodayHero } from '../TodayHero';

interface TodayHeroTestProps {
  todayShow: { id: string; name: string; startDate: string; entryCloseDate?: string | null } | null;
  nextShow: { id: string; name: string; startDate: string; entryCloseDate?: string | null } | null;
  liveClassCount: number;
  notStartedCount: number;
  closedCount: number;
}

function renderHero(props: TodayHeroTestProps) {
  return render(
    <MemoryRouter>
      <TodayHero {...props} />
    </MemoryRouter>
  );
}

describe('TodayHero', () => {
  it('shows show-day variant when todayShow is provided', () => {
    renderHero({
      todayShow: { id: 'show-1', name: 'Spring Trial 2026', startDate: new Date().toISOString() },
      nextShow: null,
      liveClassCount: 3,
      notStartedCount: 2,
      closedCount: 1,
    });
    expect(screen.getByText('Show Day')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial 2026')).toBeInTheDocument();
    expect(screen.getByText(/3 classes live/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to day-of/i })).toBeInTheDocument();
  });

  it('shows prep-mode variant when no show today but nextShow exists', () => {
    const futureDate = new Date(Date.now() + 18 * 86400000).toISOString();
    renderHero({
      todayShow: null,
      nextShow: { id: 'show-2', name: 'Spring Trial 2026', startDate: futureDate },
      liveClassCount: 0,
      notStartedCount: 0,
      closedCount: 0,
    });
    expect(screen.getByText(/in \d+ days/i)).toBeInTheDocument();
    expect(screen.getByText('Spring Trial 2026')).toBeInTheDocument();
    expect(screen.queryByText('Show Day')).not.toBeInTheDocument();
  });

  it('shows empty state when no shows at all', () => {
    renderHero({
      todayShow: null,
      nextShow: null,
      liveClassCount: 0,
      notStartedCount: 0,
      closedCount: 0,
    });
    expect(screen.getByText(/no upcoming shows/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create one/i })).toBeInTheDocument();
  });
});
