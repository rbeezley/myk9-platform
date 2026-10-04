import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { TrialEntriesTable } from '@/components/trials/TrialDetail/TrialEntriesTable';
import type { TrialEntryRow } from '@/hooks/queries/useTrialEntries';

const mockUseTrialEntries = vi.fn();
vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: (...args: unknown[]) => mockUseTrialEntries(...args),
}));

function entry(id: string, dogName: string, handler: string, className: string): TrialEntryRow {
  return {
    id,
    class_id: `class-${id}`,
    entry_status: 'accepted',
    check_in_status: 'no-status',
    handler,
    armband: `10${id}`,
    created_at: '2026-05-01T12:00:00Z',
    dog: { id: `dog-${id}`, name: dogName, call_name: dogName, breed: 'Beagle', owner: null },
    class: { id: `class-${id}`, name: className },
  } as unknown as TrialEntryRow;
}

const ROWS = [
  entry('1', 'Biscuit', 'Alice Jones', 'Container Novice A'),
  entry('2', 'Rocket', 'Bob Smith', 'Interior Advanced B'),
  entry('3', 'Maple', 'Carol White', 'Exterior Novice A'),
];

describe('TrialEntriesTable search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTrialEntries.mockReturnValue({ data: ROWS, isLoading: false, isError: false });
  });

  it('shows every entry before searching', () => {
    render(<TrialEntriesTable trialId="t1" />);
    expect(screen.getByText('Biscuit')).toBeInTheDocument();
    expect(screen.getByText('Rocket')).toBeInTheDocument();
    expect(screen.getByText('Maple')).toBeInTheDocument();
  });

  it('narrows rows by dog name and reports the count', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TrialEntriesTable trialId="t1" />);
    await user.type(screen.getByPlaceholderText('Search entries...'), 'Rocket');
    await waitFor(() => expect(screen.queryByText('Biscuit')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(screen.getByText('Rocket')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 3 entries/)).toBeInTheDocument();
  });

  it('searches the handler and class columns', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TrialEntriesTable trialId="t1" />);
    const input = screen.getByPlaceholderText('Search entries...');
    await user.type(input, 'Carol');
    await waitFor(() => expect(screen.queryByText('Biscuit')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(screen.getByText('Maple')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'Interior');
    await waitFor(() => expect(screen.queryByText('Maple')).not.toBeInTheDocument(), {
      timeout: 1500,
    });
    expect(screen.getByText('Rocket')).toBeInTheDocument();
  });

  it('shows a no-results message when nothing matches and recovers on clear', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TrialEntriesTable trialId="t1" />);
    const input = screen.getByPlaceholderText('Search entries...');
    await user.type(input, 'zzzzz');
    await waitFor(
      () => expect(screen.getByText(/No results match your filters/)).toBeInTheDocument(),
      {
        timeout: 1500,
      }
    );
    expect(screen.queryByText('No entries yet')).not.toBeInTheDocument();
    await user.clear(input);
    await waitFor(() => expect(screen.getByText('Biscuit')).toBeInTheDocument(), { timeout: 1500 });
  });

  it('shows the empty state with no entries and no search chrome counting zero', () => {
    mockUseTrialEntries.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<TrialEntriesTable trialId="t1" />);
    expect(screen.getByText('No entries yet')).toBeInTheDocument();
  });

  it('shows the error state', () => {
    mockUseTrialEntries.mockReturnValue({ data: [], isLoading: false, isError: true });
    render(<TrialEntriesTable trialId="t1" />);
    expect(screen.getByText('Failed to load entries')).toBeInTheDocument();
  });
});
