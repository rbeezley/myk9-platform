import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { SubstituteJudgeEmailOffer } from './SubstituteJudgeEmailOffer';

const mocks = vi.hoisted(() => ({
  fetchOffer: vi.fn(),
  queue: vi.fn(),
  online: true,
}));

vi.mock('./substituteJudgeEmails', () => ({
  fetchSubstituteJudgeEmailOffer: mocks.fetchOffer,
  queueSubstituteJudgeEmails: mocks.queue,
}));
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

    expect(mocks.queue).toHaveBeenCalledWith('class-1');
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
});
