import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CloseOutShowAction } from '../CloseOutShowAction';

const updateShowMock = vi.hoisted(() => vi.fn());
const updateTrialMock = vi.hoisted(() => vi.fn());
const updateClassMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { updateShow: updateShowMock },
  replicatedTrialsTable: { updateTrial: updateTrialMock },
  replicatedClassesTable: { updateClass: updateClassMock },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const baseProps = {
  show: { id: 'show-1', status: 'in_progress' },
  trials: [
    { id: 'trial-open', status: 'in_progress' },
    { id: 'trial-completed', status: 'completed' },
    { id: 'trial-cancelled', status: 'cancelled' },
  ],
  classes: [
    { id: 'class-open', status: 'in_progress', entryCount: 2, scoredCount: 2 },
    { id: 'class-completed', status: 'completed', entryCount: 1, scoredCount: 1 },
    { id: 'class-cancelled', status: 'cancelled', entryCount: 1, scoredCount: 0 },
  ],
  entries: [],
  incidents: { reportableCount: 0, urgentCount: 0 },
  submissions: [{ status: 'sent' }],
};

describe('CloseOutShowAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateShowMock.mockResolvedValue('show-mutation');
    updateTrialMock.mockResolvedValue('trial-mutation');
    updateClassMock.mockResolvedValue('class-mutation');
  });

  it('renders the closed state without offering another mutation', () => {
    render(<CloseOutShowAction {...baseProps} show={{ id: 'show-1', status: 'completed' }} />);

    expect(screen.getByRole('heading', { name: 'Show closed out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close Out Show' })).not.toBeInTheDocument();
  });

  it('shows closeout concerns before confirmation', async () => {
    const { user } = render(
      <CloseOutShowAction
        {...baseProps}
        classes={[{ id: 'class-open', status: 'in_progress', entryCount: 2, scoredCount: 1 }]}
        entries={[
          {
            id: 'entry-1',
            entry_fee: 35,
            entry_status: 'scratched',
            check_in_status: 'pulled',
            payment_status: 'paid',
          },
        ]}
        incidents={{ reportableCount: 1, urgentCount: 1 }}
        submissions={[]}
      />
    );

    expect(screen.getByText('Review before final closeout')).toBeInTheDocument();
    expect(screen.getByText('1 class still has unscored entries.')).toBeInTheDocument();
    expect(
      screen.getByText('No result submission has been recorded for this show.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close Out Show' }));
    expect(await screen.findByRole('button', { name: 'Close anyway' })).toBeInTheDocument();
  });

  it('queues replicated closeout updates for only open hierarchy rows', async () => {
    const { user } = render(<CloseOutShowAction {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Close Out Show' }));
    await user.click(await screen.findByRole('button', { name: 'Close out show' }));

    await waitFor(() =>
      expect(updateShowMock).toHaveBeenCalledWith('show-1', { status: 'completed' })
    );
    expect(updateTrialMock).toHaveBeenCalledTimes(1);
    expect(updateTrialMock).toHaveBeenCalledWith('trial-open', { status: 'completed' });
    expect(updateClassMock).toHaveBeenCalledTimes(1);
    expect(updateClassMock).toHaveBeenCalledWith('class-open', { classStatus: 'completed' });
    expect(updateTrialMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateShowMock.mock.invocationCallOrder[0]
    );
    expect(updateClassMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateShowMock.mock.invocationCallOrder[0]
    );
  });

  it('reports a failed child cascade without closing the parent show', async () => {
    const { toast } = await import('sonner');
    updateClassMock.mockRejectedValueOnce(new Error('offline queue unavailable'));
    const { user } = render(<CloseOutShowAction {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Close Out Show' }));
    await user.click(await screen.findByRole('button', { name: 'Close out show' }));

    expect(
      await screen.findByText(
        'Closeout did not finish. Try again after checking your connection and sync status.'
      )
    ).toBeInTheDocument();
    expect(updateShowMock).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Closeout did not finish. Please try again.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports a failed parent closeout after child updates queue', async () => {
    const { toast } = await import('sonner');
    updateShowMock.mockRejectedValueOnce(new Error('offline queue unavailable'));
    const { user } = render(<CloseOutShowAction {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Close Out Show' }));
    await user.click(await screen.findByRole('button', { name: 'Close out show' }));

    expect(
      await screen.findByText(
        'Closeout did not finish. Try again after checking your connection and sync status.'
      )
    ).toBeInTheDocument();
    expect(updateTrialMock).toHaveBeenCalledWith('trial-open', { status: 'completed' });
    expect(updateClassMock).toHaveBeenCalledWith('class-open', { classStatus: 'completed' });
    expect(toast.error).toHaveBeenCalledWith('Closeout did not finish. Please try again.');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
