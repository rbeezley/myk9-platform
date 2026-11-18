import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { SubstituteJudgeEmailOffer } from './SubstituteJudgeEmailOffer';

const mocks = vi.hoisted(() => ({
  fetchOffer: vi.fn(),
  queue: vi.fn(),
  toastInfo: vi.fn(),
  online: true,
}));

vi.mock('./substituteJudgeEmails', () => ({
  fetchSubstituteJudgeEmailOffer: mocks.fetchOffer,
  queueSubstituteJudgeEmails: mocks.queue,
}));
vi.mock('sonner', () => ({ toast: { info: mocks.toastInfo, error: vi.fn() } }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.online }));

const BUTTON = /email the 3 exhibitors who were told no judge yet/i;

describe('SubstituteJudgeEmailOffer (MYK9-2161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online = true;
  });

  it('offers the follow-up with the count and queues it for the class on tap, then says it was sent', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer
      .mockResolvedValueOnce({ pendingCount: 3, sentCount: 0 })
      .mockResolvedValue({ pendingCount: 0, sentCount: 3 });
    mocks.queue.mockResolvedValue(3);
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);

    await user.click(await screen.findByRole('button', { name: BUTTON }));

    expect(mocks.queue).toHaveBeenCalledWith('class-1', 'judge-b');
    expect(
      await screen.findByText('Email is on its way to 3 exhibitors who were told no judge yet.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email the/i })).not.toBeInTheDocument();
  });

  it('shows nothing when nobody was told no judge yet', async () => {
    mocks.fetchOffer.mockResolvedValue({ pendingCount: 0, sentCount: 0 });
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledWith('class-1'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks nothing of the server for a class with no judge', () => {
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId={null} />);
    expect(mocks.fetchOffer).not.toHaveBeenCalled();
  });

  it('shows nothing and asks nothing while offline', () => {
    mocks.online = false;
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);
    expect(mocks.fetchOffer).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when the count could not be read, and checks again on tap', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ pendingCount: 3, sentCount: 0 });
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);

    expect(await screen.findByText(/couldn't check whether any exhibitors/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('button', { name: BUTTON })).toBeInTheDocument();
  });

  it('asks again when an upload completes, because the pick may have just reached the server', async () => {
    mocks.fetchOffer
      .mockResolvedValueOnce({ pendingCount: 0, sentCount: 0 })
      .mockResolvedValue({ pendingCount: 3, sentCount: 0 });
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new CustomEvent('replication:upload-complete'));

    expect(await screen.findByRole('button', { name: BUTTON })).toBeInTheDocument();
  });

  it('ignores an upload that carried no judge pick for this class', async () => {
    mocks.fetchOffer.mockResolvedValue({ pendingCount: 0, sentCount: 0 });
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledTimes(1));

    const upload = (mutations: Array<{ tableName: string; rowId: string; rpcName?: string }>) =>
      window.dispatchEvent(
        new CustomEvent('replication:upload-complete', {
          detail: {
            tables: ['entries'],
            count: mutations.length,
            mutations: mutations.map(m => ({ operation: 'UPDATE', ...m })),
          },
        })
      );
    upload([{ tableName: 'entries', rowId: 'entry-1' }]);
    upload([{ tableName: 'classes', rowId: 'class-2', rpcName: 'set_class_judge' }]);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.fetchOffer).toHaveBeenCalledTimes(1);

    upload([{ tableName: 'classes', rowId: 'class-1', rpcName: 'set_class_judge' }]);
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledTimes(2));
  });

  it('says so when some people already have an email going out and were left alone', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer.mockResolvedValue({ pendingCount: 3, sentCount: 0 });
    mocks.queue.mockResolvedValue(1);
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);

    await user.click(await screen.findByRole('button', { name: BUTTON }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(
        '2 exhibitors already have an email going out. Tap again in a few minutes to email them too.'
      )
    );
  });

  it('looks again when the server says the class has another judge now', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer.mockResolvedValue({ pendingCount: 3, sentCount: 0 });
    mocks.queue.mockRejectedValue({ code: 'P0001' });
    render(<SubstituteJudgeEmailOffer classId="class-1" assignedJudgeId="judge-b" />);

    await user.click(await screen.findByRole('button', { name: BUTTON }));

    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledTimes(2));
  });
});
