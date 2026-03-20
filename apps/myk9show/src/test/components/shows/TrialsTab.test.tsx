import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrialsTab } from '@/components/shows/tabs/TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

let mockHasPermission = (_p: string) => false;
vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: (p: string) => mockHasPermission(p),
  }),
}));

vi.mock('@myk9/core', () => ({
  getClassStatusBadgeClasses: () => 'bg-gray-100 text-gray-800',
  getClassStatusDisplay: (status: string) => {
    if (status === 'In Progress') return { label: 'In Progress' };
    if (status === 'Completed') return { label: 'Complete' };
    return { label: 'Upcoming' };
  },
  CLASS_STATUS: {
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In Progress',
    SCHEDULED: 'Scheduled',
  },
}));

let mockViewMode = 'cards';
vi.mock('@/hooks/useViewPreference', () => ({
  useViewPreference: () => [mockViewMode, (m: string) => { mockViewMode = m; }],
  CARD_TABLE_MODES: [
    { key: 'cards', label: 'Cards', icon: 'grid' },
    { key: 'table', label: 'Table', icon: 'table' },
  ],
}));

vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: ({ active, onChange }: { active: string; onChange: (k: string) => void }) => (
    <div data-testid="view-toggle">
      <button data-testid="toggle-cards" onClick={() => onChange('cards')}>Cards</button>
      <button data-testid="toggle-table" onClick={() => onChange('table')}>Table</button>
      <span data-testid="active-view">{active}</span>
    </div>
  ),
}));

vi.mock('@/utils/dateLocal', () => ({
  parseLocalDateString: (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return isNaN(d.getTime()) ? undefined : d;
  },
}));

function makeTrial(overrides: Partial<Trial> & { id: string }): Trial {
  return {
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-05-10',
    trialNumber: '1',
    status: 'Upcoming',
    ...overrides,
  } as Trial;
}

describe('TrialsTab', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockHasPermission = () => false;
    mockViewMode = 'cards';
  });

  it('renders date element with month and day', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('MAY')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('displays class and entry counts', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('classes')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('shows scored text when completedClasses > 0', () => {
    const trials = [makeTrial({ id: 't1', status: 'In Progress' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 3 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('3/5 scored')).toBeInTheDocument();
  });

  it('hides scored text when completedClasses is 0', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.queryByText(/scored/)).not.toBeInTheDocument();
  });

  it('shows empty state when no trials', () => {
    render(<TrialsTab trials={[]} showId="show-1" trialStats={{}} />);

    expect(screen.getByText('No Trials')).toBeInTheDocument();
  });

  it('displays trial type and start time', () => {
    const trials = [makeTrial({ id: 't1', trialType: 'Scent Work', plannedStartTime: '8:00 AM' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText(/Scent Work/)).toBeInTheDocument();
    expect(screen.getByText(/8:00 AM/)).toBeInTheDocument();
  });

  it('handles missing trialStats gracefully', () => {
    const trials = [makeTrial({ id: 't1' })];
    // No stats for t1
    render(<TrialsTab trials={trials} showId="show-1" trialStats={{}} />);

    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getByText('classes')).toBeInTheDocument();
  });

  it('shows full scored count for completed trial', () => {
    const trials = [makeTrial({ id: 't1', status: 'Completed' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 5 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('5/5 scored')).toBeInTheDocument();
  });

  it('renders without date element when trialDate is empty', () => {
    const trials = [makeTrial({ id: 't1', trialDate: '' })];
    const stats = { t1: { classCount: 3, entryCount: 20, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    // Card renders but no month/day text from date element
    expect(screen.queryByText('MAY')).not.toBeInTheDocument();
    // Counts still render
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows Add Trial button when user has manage permission', () => {
    mockHasPermission = (p: string) => p === 'admin:manage';
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.getByText('Add Trial')).toBeInTheDocument();
  });

  it('hides Add Trial button when user lacks permissions', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 0, entryCount: 0, completedClasses: 0 } };

    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);

    expect(screen.queryByText('Add Trial')).not.toBeInTheDocument();
  });

  it('renders ViewToggle', () => {
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };
    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument();
  });

  it('renders table view with column headers when mode is table', () => {
    mockViewMode = 'table';
    const trials = [makeTrial({ id: 't1', trialType: 'Scent Work', plannedStartTime: '8:00 AM' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 3 } };
    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
    expect(screen.getByText('Trial Name')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('navigates on table row click', () => {
    mockViewMode = 'table';
    const trials = [makeTrial({ id: 't1' })];
    const stats = { t1: { classCount: 5, entryCount: 42, completedClasses: 0 } };
    render(<TrialsTab trials={trials} showId="show-1" trialStats={stats} />);
    fireEvent.click(screen.getByText('Trial 1'));
    expect(mockNavigate).toHaveBeenCalledWith('/shows/show-1/trials/t1');
  });
});
