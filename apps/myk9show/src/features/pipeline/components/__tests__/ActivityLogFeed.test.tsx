import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { ActivityLogFeed } from '../ActivityLogFeed';
import { useActivityLog } from '../../hooks/useActivityLog';
import type { ActivityLogEntry } from '../../types';

vi.mock('../../hooks/useActivityLog', () => ({
  useActivityLog: vi.fn(),
}));

function makeEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 'entry-1',
    trial_id: 'trial-1',
    action_type: 'stage_transition',
    description: 'Moved to Judging',
    actor_id: 'user-1',
    actor_name: 'Alice Secretary',
    metadata: {},
    created_at: '2026-04-01T10:00:00Z',
    ...overrides,
  };
}

function mockResult(entries: ActivityLogEntry[], overrides: Partial<Record<string, unknown>> = {}) {
  vi.mocked(useActivityLog).mockReturnValue({
    data: { pages: [{ entries, hasMore: false }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    ...overrides,
  } as unknown as ReturnType<typeof useActivityLog>);
}

describe('ActivityLogFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders every loaded entry when no filter is active', () => {
    mockResult([
      makeEntry({ id: 'e-1', description: 'Moved to Judging' }),
      makeEntry({ id: 'e-2', description: 'Score submitted', action_type: 'score_submitted' }),
    ]);
    render(<ActivityLogFeed trialId="trial-1" />);
    expect(screen.getByText('Moved to Judging')).toBeInTheDocument();
    expect(screen.getByText('Score submitted')).toBeInTheDocument();
  });

  it('search narrows loaded entries by description or actor name, client-side', async () => {
    mockResult([
      makeEntry({ id: 'e-1', description: 'Moved to Judging', actor_name: 'Alice Secretary' }),
      makeEntry({ id: 'e-2', description: 'Score submitted', actor_name: 'Bob Judge' }),
    ]);
    render(<ActivityLogFeed trialId="trial-1" />);

    await userEvent.type(screen.getByPlaceholderText('Search activity...'), 'Bob');
    expect(screen.queryByText('Moved to Judging')).not.toBeInTheDocument();
    expect(screen.getByText('Score submitted')).toBeInTheDocument();
  });

  it('picking a Type filter value re-queries the hook with that action type', async () => {
    mockResult([makeEntry()]);
    render(<ActivityLogFeed trialId="trial-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Type' }));
    await userEvent.click(screen.getByRole('button', { name: 'Score events' }));

    expect(useActivityLog).toHaveBeenLastCalledWith(
      'trial-1',
      expect.objectContaining({ actionType: 'score_submitted' })
    );
  });

  it('shows a distinct empty state when a search matches nothing, vs. no activity at all', async () => {
    mockResult([makeEntry({ description: 'Moved to Judging' })]);
    render(<ActivityLogFeed trialId="trial-1" />);

    await userEvent.type(screen.getByPlaceholderText('Search activity...'), 'nothing matches this');
    expect(screen.getByText('No activity matches your search')).toBeInTheDocument();
  });

  it('shows the plain empty state when the trial has no activity yet', () => {
    mockResult([]);
    render(<ActivityLogFeed trialId="trial-1" />);
    expect(screen.getByText('No activity yet')).toBeInTheDocument();
  });
});
