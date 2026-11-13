import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryScoreHistory } from './EntryScoreHistory';
import { useEntryScoreAudit } from '@/hooks/useEntryScoreAudit';

vi.mock('@/hooks/useEntryScoreAudit', () => ({
  useEntryScoreAudit: vi.fn(),
}));

const mockUseEntryScoreAudit = vi.mocked(useEntryScoreAudit);

const baseAudit = {
  canViewScoreHistory: true,
  data: undefined,
  isError: false,
  isPending: false,
  fetchStatus: 'idle',
  refetch: vi.fn(),
};

const signedInRow = {
  id: 'audit-1',
  changedAt: '2026-11-07T16:05:00.000Z',
  clientSavedAt: '2026-11-07T15:42:00.000Z',
  actorName: 'Jo Judge',
  actorTier: 'assigned_judge',
  passcodeRole: null,
  changes: [
    { field: 'is_scored', oldValue: false, newValue: true },
    { field: 'search_time_seconds', oldValue: null, newValue: 74.5 },
  ],
  timeZone: 'America/New_York',
};

const passcodeRow = {
  id: 'audit-2',
  changedAt: '2026-11-07T17:00:00.000Z',
  clientSavedAt: null,
  actorName: null,
  actorTier: 'passcode_judge',
  passcodeRole: 'judge',
  changes: [{ field: 'result_status', oldValue: 'qualified', newValue: 'nq' }],
  timeZone: 'America/New_York',
};

async function openHistory() {
  const view = render(<EntryScoreHistory entryId="entry-1" />);
  await view.user.click(screen.getByRole('button', { name: /view score history/i }));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEntryScoreAudit.mockReturnValue(baseAudit as never);
});

describe('EntryScoreHistory', () => {
  it('is hidden for roles that cannot read the audit', () => {
    mockUseEntryScoreAudit.mockReturnValue({ ...baseAudit, canViewScoreHistory: false } as never);

    render(<EntryScoreHistory entryId="entry-1" />);

    expect(screen.queryByRole('button', { name: /score history/i })).not.toBeInTheDocument();
  });

  it('shows a loading state while the audit is fetched', async () => {
    mockUseEntryScoreAudit.mockReturnValue({
      ...baseAudit,
      isPending: true,
      fetchStatus: 'fetching',
    } as never);

    await openHistory();

    expect(screen.getByRole('status', { name: /loading score history/i })).toBeInTheDocument();
  });

  it('does not spin forever when the device is offline', async () => {
    mockUseEntryScoreAudit.mockReturnValue({
      ...baseAudit,
      isPending: true,
      fetchStatus: 'paused',
    } as never);

    await openHistory();

    expect(
      screen.queryByRole('status', { name: /loading score history/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/available when this device is connected/i)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    mockUseEntryScoreAudit.mockReturnValue({ ...baseAudit, data: [] } as never);

    await openHistory();

    expect(screen.getByText('No score changes recorded')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    const refetch = vi.fn();
    mockUseEntryScoreAudit.mockReturnValue({ ...baseAudit, isError: true, refetch } as never);

    const { user } = await openHistory();
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText(/score history is unavailable/i)).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows who, both times in the show timezone, and what changed', async () => {
    mockUseEntryScoreAudit.mockReturnValue({ ...baseAudit, data: [signedInRow] } as never);

    await openHistory();

    expect(screen.getByText('Jo Judge')).toBeInTheDocument();
    expect(
      screen.getByText('Saved on device Nov 7, 10:42 AM EST · Reached myK9Show Nov 7, 11:05 AM EST')
    ).toBeInTheDocument();
    expect(screen.getByText('Is scored: no → yes')).toBeInTheDocument();
    expect(screen.getByText('Search time seconds: empty → 74.5')).toBeInTheDocument();
  });

  it('omits the device time when none was sent and labels a passcode actor by role', async () => {
    mockUseEntryScoreAudit.mockReturnValue({ ...baseAudit, data: [passcodeRow] } as never);

    await openHistory();

    expect(screen.getByText('Ringside code (judge)')).toBeInTheDocument();
    expect(screen.getByText('Recorded Nov 7, 12:00 PM EST')).toBeInTheDocument();
    expect(screen.queryByText(/saved on device/i)).not.toBeInTheDocument();
    expect(screen.getByText('Result status: qualified → nq')).toBeInTheDocument();
  });

  it('labels a system change Automatic, even when it carries the user who set it off', async () => {
    mockUseEntryScoreAudit.mockReturnValue({
      ...baseAudit,
      data: [
        {
          ...signedInRow,
          id: 'audit-3',
          actorName: 'Sam Secretary',
          actorTier: 'system',
          clientSavedAt: null,
          changes: [{ field: 'final_placement', oldValue: null, newValue: 2 }],
        },
        { ...signedInRow, id: 'audit-4', actorName: 'Sam Secretary', actorTier: 'manager' },
      ],
    } as never);

    await openHistory();

    expect(screen.getByText('Automatic')).toBeInTheDocument();
    expect(screen.getByText('Final placement: empty → 2')).toBeInTheDocument();
    expect(screen.getAllByText('Sam Secretary')).toHaveLength(1);
  });
});
