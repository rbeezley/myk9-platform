import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityTab from '../ActivityTab';

// UX walk remediation 2.B: the dog-profile upcoming-entry badge must show the
// composed status line in the viewer's voice — never the raw enum ("submitted").

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

const FUTURE = '2099-08-01';

const upcomingRow = {
  id: 'entry-1',
  entry_status: 'submitted',
  show: { id: 'show-1', name: 'Heartland Scent Work', start_date: FUTURE },
  class: { id: 'class-1', name: 'Container Novice A' },
};

describe('ActivityTab upcoming-entry status line (2.B)', () => {
  beforeEach(() => {
    useEntriesByDogQueryMock.mockReturnValue({
      data: { rows: [upcomingRow], verified: true },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('speaks the exhibitor voice and never the raw enum', () => {
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('Submitted — awaiting review')).toBeVisible();
    expect(screen.queryByText('submitted')).toBeNull();
  });

  it('shows a same-day score as preliminary with a class link and no unreleased placement', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
    useEntriesByDogQueryMock.mockReturnValue({
      data: {
        rows: [
          {
            id: 'entry-1',
            entry_status: 'confirmed',
            is_scored: true,
            result_status: 'qualified',
            search_time_seconds: 43.21,
            final_placement: 1,
            class_results_released_at: null,
            trial_id: 'trial-1',
            trial: { date: '2026-09-28', timezone: 'America/Chicago' },
            show: { id: 'show-1', name: 'Today Show', start_date: '2026-09-28' },
            class: { id: 'class-1', name: 'Container Novice A' },
          },
        ],
        verified: true,
        resultsVerified: true,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    try {
      render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
      expect(screen.getByText('Recent results')).toBeInTheDocument();
      expect(screen.getByText('0:43.21')).toBeInTheDocument();
      expect(screen.getByText('preliminary')).toBeInTheDocument();
      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Today Show' })).toHaveAttribute(
        'href',
        '/shows/show-1/trials/trial-1/classes/class-1'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not claim an offline score is preliminary when release is unknown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T16:00:00Z'));
    useEntriesByDogQueryMock.mockReturnValue({
      data: {
        rows: [
          {
            id: 'entry-1',
            entry_status: 'confirmed',
            is_scored: true,
            result_status: 'qualified',
            search_time_seconds: 43.21,
            final_placement: 1,
            trial: { date: '2026-09-28', timezone: 'America/Chicago' },
            show: { id: 'show-1', name: 'Today Show', start_date: '2026-09-28' },
            class: { id: 'class-1', name: 'Container Novice A' },
          },
        ],
        verified: true,
        resultsVerified: false,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    try {
      render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
      expect(screen.queryByText('preliminary')).not.toBeInTheDocument();
      expect(screen.getByText('Release status unavailable')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a retry when the entry list loads but its scored projection does not', () => {
    useEntriesByDogQueryMock.mockReturnValue({
      data: { rows: [upcomingRow], verified: true, resultsVerified: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText(/Recent results unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('speaks the secretary voice for the same entry', () => {
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="secretary" />);
    expect(screen.getByText('Needs review')).toBeVisible();
    expect(screen.queryByText('submitted')).toBeNull();
  });
});
