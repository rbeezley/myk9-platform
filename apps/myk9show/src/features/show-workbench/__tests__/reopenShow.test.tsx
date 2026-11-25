import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { reopenShow } from '../reopenShow';
import { ReopenShowAction } from '../ReopenShowAction';

const updateShowMock = vi.hoisted(() => vi.fn());
const updateTrialMock = vi.hoisted(() => vi.fn());
const updateClassMock = vi.hoisted(() => vi.fn());
const getTrialsMock = vi.hoisted(() => vi.fn());
const getClassesMock = vi.hoisted(() => vi.fn());
const saveReasonMock = vi.hoisted(() => vi.fn());
const manageScopeMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { updateShow: updateShowMock },
  replicatedTrialsTable: { updateTrial: updateTrialMock, getTrialsByShow: getTrialsMock },
  replicatedClassesTable: { updateClass: updateClassMock, getClassesByTrial: getClassesMock },
}));
vi.mock('@/services/database/showCloseNotes', () => ({
  saveReopenReason: saveReasonMock,
  saveClosedOpenLines: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'u1', email: 'jane@example.com' },
    userWithRoles: {
      id: 'u1',
      email: 'jane@example.com',
      roles: ['secretary'],
      user_metadata: { full_name: 'Jane Secretary' },
    },
  }),
}));
vi.mock('@/hooks/useShowManageScope', () => ({ useShowManageScope: manageScopeMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const NOW = new Date('2026-11-25T18:30:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  updateShowMock.mockResolvedValue('m');
  updateTrialMock.mockResolvedValue('m');
  updateClassMock.mockResolvedValue('m');
  saveReasonMock.mockResolvedValue(undefined);
  manageScopeMock.mockReturnValue({ status: 'resolved', canManage: true });
  getTrialsMock.mockResolvedValue([
    { id: 'trial-a', status: 'completed', statusBeforeClose: 'in_progress' },
    { id: 'trial-b', status: 'completed', statusBeforeClose: null },
  ]);
  getClassesMock.mockImplementation(async (trialId: string) =>
    trialId === 'trial-a'
      ? [
          { id: 'class-1', classStatus: 'completed', statusBeforeClose: 'upcoming' },
          { id: 'class-2', classStatus: 'completed', statusBeforeClose: null },
          { id: 'class-3', classStatus: 'cancelled', statusBeforeClose: null },
        ]
      : []
  );
});

describe('reopenShow', () => {
  it('restores each status from before the close and records reason, person and time', async () => {
    await reopenShow({
      showId: 'show-1',
      reason: '  Closed by mistake  ',
      person: 'Pat Secretary',
      now: NOW,
    });

    expect(saveReasonMock).toHaveBeenCalledWith(
      'show-1',
      'Closed by mistake\n\nReopened by Pat Secretary at 2026-11-25T18:30:00.000Z'
    );
    expect(updateTrialMock).toHaveBeenCalledTimes(1);
    expect(updateTrialMock).toHaveBeenCalledWith('trial-a', {
      status: 'in_progress',
      statusBeforeClose: null,
    });
    expect(updateClassMock).toHaveBeenCalledTimes(1);
    expect(updateClassMock).toHaveBeenCalledWith('class-1', {
      classStatus: 'upcoming',
      statusBeforeClose: null,
    });
    expect(updateShowMock).toHaveBeenCalledWith('show-1', {
      status: 'in_progress',
      closedAt: null,
      reopenedAt: '2026-11-25T18:30:00.000Z',
    });
  });

  it('changes nothing when the reason cannot be saved', async () => {
    saveReasonMock.mockRejectedValueOnce(new Error('offline'));

    await expect(
      reopenShow({ showId: 'show-1', reason: 'x', person: 'Pat', now: NOW })
    ).rejects.toThrow('The reopen reason could not be saved.');
    expect(updateTrialMock).not.toHaveBeenCalled();
    expect(updateClassMock).not.toHaveBeenCalled();
    expect(updateShowMock).not.toHaveBeenCalled();
  });

  it('leaves the show closed when a restore fails, so it can be retried', async () => {
    updateClassMock.mockRejectedValueOnce(new Error('queue unavailable'));

    await expect(
      reopenShow({ showId: 'show-1', reason: 'x', person: 'Pat', now: NOW })
    ).rejects.toThrow();
    expect(updateShowMock).not.toHaveBeenCalled();
  });
});

describe('ReopenShowAction', () => {
  it('is hidden for someone who cannot manage the show', () => {
    manageScopeMock.mockReturnValue({ status: 'resolved', canManage: false });
    render(<ReopenShowAction showId="show-1" />);

    expect(screen.queryByRole('button', { name: 'Reopen show' })).not.toBeInTheDocument();
  });

  it('needs a reason, then reopens', async () => {
    const { user } = render(<ReopenShowAction showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Reopen show' }));
    const confirm = await screen.findByRole('button', { name: 'Reopen show', hidden: false });
    const buttons = screen.getAllByRole('button', { name: 'Reopen show' });
    const submit = buttons[buttons.length - 1] ?? confirm;
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Why are you reopening it?'), 'Scores to fix');
    await user.click(submit);

    await waitFor(() => expect(updateShowMock).toHaveBeenCalledTimes(1));
    expect(saveReasonMock).toHaveBeenCalledWith(
      'show-1',
      expect.stringMatching(/^Scores to fix\n\nReopened by Jane Secretary at \d{4}-\d{2}-\d{2}T/)
    );
  });

  it('says plainly that reopening needs a connection when the note cannot be saved', async () => {
    saveReasonMock.mockRejectedValueOnce(new Error('offline'));
    const { user } = render(<ReopenShowAction showId="show-1" />);

    await user.click(screen.getByRole('button', { name: 'Reopen show' }));
    await user.type(await screen.findByLabelText('Why are you reopening it?'), 'Scores to fix');
    const buttons = screen.getAllByRole('button', { name: 'Reopen show' });
    await user.click(buttons[buttons.length - 1]!);

    expect(
      await screen.findByText(/Reopening needs a connection so your reason can be kept/)
    ).toBeInTheDocument();
    expect(updateShowMock).not.toHaveBeenCalled();
  });
});
