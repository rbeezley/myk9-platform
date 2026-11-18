import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { SubstituteJudgeEmailOffer } from './SubstituteJudgeEmailOffer';

const mocks = vi.hoisted(() => ({
  fetchOffer: vi.fn(),
  queue: vi.fn(),
  dismiss: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  online: true,
}));

vi.mock('./substituteJudgeEmails', () => ({
  fetchSubstituteJudgeEmailOffer: mocks.fetchOffer,
  queueSubstituteJudgeEmails: mocks.queue,
  dismissSubstituteJudgeEmailOffer: mocks.dismiss,
}));
vi.mock('sonner', () => ({
  toast: { info: mocks.toastInfo, error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => mocks.online }));

const SEND = /email the exhibitors in container novice a that their judge is now ann judge/i;

function renderOffer(assignedJudgeId: string | null = 'judge-b') {
  return render(
    <SubstituteJudgeEmailOffer
      classId="class-1"
      classLabel="Container Novice A"
      assignedJudgeId={assignedJudgeId}
      judgeName="Ann Judge"
    />
  );
}

describe('SubstituteJudgeEmailOffer (MYK9-2161)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.online = true;
  });

  it('offers the email, queues it for the class and judge on tap, then goes away', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer
      .mockResolvedValueOnce({ judgeId: 'judge-b', recipientCount: 3 })
      .mockResolvedValue(null);
    mocks.queue.mockResolvedValue(3);
    renderOffer();

    const send = await screen.findByRole('button', { name: SEND });
    expect(send).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveClass('min-h-11');
    await user.click(send);

    expect(mocks.queue).toHaveBeenCalledWith('class-1', 'judge-b');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: SEND })).not.toBeInTheDocument()
    );
  });

  it('hides the offer for this judge when dismissed, without queueing anything', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer
      .mockResolvedValueOnce({ judgeId: 'judge-b', recipientCount: 3 })
      .mockResolvedValue(null);
    mocks.dismiss.mockResolvedValue(undefined);
    renderOffer();

    await user.click(await screen.findByRole('button', { name: 'Not now' }));

    expect(mocks.dismiss).toHaveBeenCalledWith('class-1', 'judge-b');
    expect(mocks.queue).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument()
    );
  });

  it('shows nothing when there is no offer (a class that never had a judge)', async () => {
    mocks.fetchOffer.mockResolvedValue(null);
    renderOffer();
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledWith('class-1'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing when the offer is for a different judge than the one on screen', async () => {
    mocks.fetchOffer.mockResolvedValue({ judgeId: 'judge-a', recipientCount: 3 });
    renderOffer();
    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalled());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks nothing of the server for a class with no judge, or while offline', () => {
    renderOffer(null);
    expect(mocks.fetchOffer).not.toHaveBeenCalled();
    mocks.online = false;
    renderOffer();
    expect(mocks.fetchOffer).not.toHaveBeenCalled();
  });

  it('says so when some people already have an email going out and were left alone', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer.mockResolvedValue({ judgeId: 'judge-b', recipientCount: 3 });
    mocks.queue.mockResolvedValue(1);
    renderOffer();

    await user.click(await screen.findByRole('button', { name: SEND }));

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(
        'Some exhibitors already have an email going out. Tap again in a few minutes to email them too.'
      )
    );
  });

  it('stays quiet when someone else already sent it (the server queued nothing and the offer is gone)', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer
      .mockResolvedValueOnce({ judgeId: 'judge-b', recipientCount: 3 })
      .mockResolvedValue(null);
    mocks.queue.mockResolvedValue(0);
    renderOffer();

    await user.click(await screen.findByRole('button', { name: SEND }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: SEND })).not.toBeInTheDocument()
    );
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('looks again when the server says the class has another judge now', async () => {
    const user = userEvent.setup();
    mocks.fetchOffer.mockResolvedValue({ judgeId: 'judge-b', recipientCount: 3 });
    mocks.queue.mockRejectedValue({ code: 'P0001' });
    renderOffer();

    await user.click(await screen.findByRole('button', { name: SEND }));

    await waitFor(() => expect(mocks.fetchOffer).toHaveBeenCalledTimes(2));
  });

  it('asks again only when an upload carried a judge pick for this class', async () => {
    mocks.fetchOffer.mockResolvedValue(null);
    renderOffer();
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
});
