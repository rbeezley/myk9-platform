import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryStatusHistory } from './EntryStatusHistory';
import { useEntryStatusHistory } from '@/hooks/useEntryStatusHistory';

vi.mock('@/hooks/useEntryStatusHistory', () => ({
  useEntryStatusHistory: vi.fn(),
}));

const mockUseEntryStatusHistory = vi.mocked(useEntryStatusHistory);

const baseHistory = {
  canViewHistory: true,
  data: undefined,
  isError: false,
  isOffline: false,
  isPending: false,
  refetch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEntryStatusHistory.mockReturnValue(baseHistory as never);
});

describe('EntryStatusHistory', () => {
  it('hides the history control for exhibitors and unauthorized roles', () => {
    mockUseEntryStatusHistory.mockReturnValue({ ...baseHistory, canViewHistory: false } as never);

    render(<EntryStatusHistory entryId="entry-1" />);

    expect(screen.queryByRole('button', { name: /entry status history/i })).not.toBeInTheDocument();
  });

  it('shows ordered transitions and calm actor/reason fallbacks', async () => {
    mockUseEntryStatusHistory.mockReturnValue({
      ...baseHistory,
      data: [
        {
          id: 'history-1',
          entryId: 'entry-1',
          previousStatus: 'submitted',
          newStatus: 'confirmed',
          changedBy: 'person-1',
          changedAt: '2026-07-16T12:00:00.000Z',
          reason: 'Accepted by secretary',
          actorName: 'Sam Secretary',
        },
        {
          id: 'history-2',
          entryId: 'entry-1',
          previousStatus: 'confirmed',
          newStatus: 'scratched',
          changedBy: null,
          changedAt: '2026-07-16T13:00:00.000Z',
          reason: null,
          actorName: null,
        },
      ],
    } as never);

    const { user } = render(<EntryStatusHistory entryId="entry-1" />);
    await user.click(screen.getByRole('button', { name: /view entry status history/i }));

    expect(screen.getByText('Submitted → Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Confirmed → Scratched')).toBeInTheDocument();
    expect(screen.getByText(/Sam Secretary/)).toBeInTheDocument();
    expect(screen.getByText(/Staff member not recorded/)).toBeInTheDocument();
    expect(screen.getByText(/No reason recorded/)).toBeInTheDocument();
  });

  it('shows an honest created/current-state fallback when history is empty', async () => {
    mockUseEntryStatusHistory.mockReturnValue({ ...baseHistory, data: [] } as never);

    const { user } = render(
      <EntryStatusHistory
        entryId="entry-1"
        currentStatus="confirmed"
        createdAt="2026-07-16T12:00:00.000Z"
      />
    );
    await user.click(screen.getByRole('button', { name: /view entry status history/i }));

    expect(screen.getByText(/no status changes have been recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/current status Confirmed/i)).toBeInTheDocument();
  });

  it('keeps history failure scoped and provides retry', async () => {
    const refetch = vi.fn();
    mockUseEntryStatusHistory.mockReturnValue({
      ...baseHistory,
      isError: true,
      refetch,
    } as never);

    const { user } = render(<EntryStatusHistory entryId="entry-1" />);
    await user.click(screen.getByRole('button', { name: /view entry status history/i }));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText(/entry work remains usable/i)).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('shows a quiet offline state and cached freshness indication', async () => {
    mockUseEntryStatusHistory.mockReturnValue({
      ...baseHistory,
      isOffline: true,
    } as never);

    const { user, rerender } = render(<EntryStatusHistory entryId="entry-1" />);
    await user.click(screen.getByRole('button', { name: /view entry status history/i }));
    expect(screen.getByText(/available when this device is connected/i)).toBeInTheDocument();

    mockUseEntryStatusHistory.mockReturnValue({
      ...baseHistory,
      isOffline: true,
      data: [
        {
          id: 'history-1',
          entryId: 'entry-1',
          previousStatus: 'submitted',
          newStatus: 'confirmed',
          changedBy: null,
          changedAt: '2026-07-16T12:00:00.000Z',
          reason: null,
          actorName: null,
        },
      ],
    } as never);
    rerender(<EntryStatusHistory entryId="entry-1" />);
    expect(screen.getByText(/saved before connection was lost/i)).toBeInTheDocument();
  });
});
