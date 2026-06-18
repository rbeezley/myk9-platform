import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { PullManagementTab } from './PullManagementTab';
import type { ScratchRequest } from '@/services/database/day-of-operations';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dayOfOpsMocks = vi.hoisted(() => ({
  getPendingScratchRequests: vi.fn(),
  getScratchedEntries: vi.fn(),
  updateRefundStatus: vi.fn(),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getPendingScratchRequests: dayOfOpsMocks.getPendingScratchRequests,
  getScratchedEntries: dayOfOpsMocks.getScratchedEntries,
  updateRefundStatus: dayOfOpsMocks.updateRefundStatus,
}));

const requestMocks = vi.hoisted(() => ({
  approvePullRequestReplicated: vi.fn(),
  denyPullRequestReplicated: vi.fn(),
}));

vi.mock('@/services/show-day/requestManagement', () => ({
  approvePullRequestReplicated: requestMocks.approvePullRequestReplicated,
  denyPullRequestReplicated: requestMocks.denyPullRequestReplicated,
}));

const eligibleRequest: ScratchRequest = {
  id: 'entry-abc',
  class_id: 'class-1',
  trial_id: 'trial-1',
  entry_status: 'withdrawn',
  entry_fee: 3200,
  created_at: '2026-06-18T10:00:00Z',
  special_requests: null,
  handler: 'Jane Doe',
  armband: '42',
  payment_status: 'paid',
  updated_at: '2026-06-18T10:00:00Z',
  refund_status: 'eligible',
  stripe_payment_intent_id: 'pi_test_123',
  dog: { id: 'dog-1', name: 'Buddy', call_name: 'Buddy' },
  class: { id: 'class-1', name: 'Novice A', class_number: '110' },
};

const nonEligibleRequest: ScratchRequest = {
  ...eligibleRequest,
  id: 'entry-def',
  refund_status: 'not_applicable',
  stripe_payment_intent_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({ data: [], error: null });
  dayOfOpsMocks.getScratchedEntries.mockResolvedValue({ data: [], error: null });
  dayOfOpsMocks.updateRefundStatus.mockResolvedValue({ error: null });
  requestMocks.approvePullRequestReplicated.mockResolvedValue({ error: null });
  requestMocks.denyPullRequestReplicated.mockResolvedValue({ error: null });
});

describe('PullManagementTab — refund checkbox pre-check', () => {
  it('pre-checks the refund box when refund_status is eligible and payment intent exists', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [eligibleRequest],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    const checkbox = screen.getByRole('checkbox', { name: /process refund/i });
    expect(checkbox).toBeChecked();
  });

  it('does not pre-check the refund box when refund_status is not_applicable', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [nonEligibleRequest],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    const checkbox = screen.getByRole('checkbox', { name: /process refund/i });
    expect(checkbox).not.toBeChecked();
  });
});

describe('PullManagementTab — approve calls updateRefundStatus for eligible entries', () => {
  it('calls updateRefundStatus with processed + entry_fee when approving a refund-eligible pull', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [eligibleRequest],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await user.click(screen.getByRole('button', { name: /approve pull/i }));

    await waitFor(() => {
      expect(dayOfOpsMocks.updateRefundStatus).toHaveBeenCalledWith(
        'entry-abc',
        'processed',
        3200
      );
    });
  });

  it('does not call updateRefundStatus when the entry is not refund-eligible', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [nonEligibleRequest],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await user.click(screen.getByRole('button', { name: /approve pull/i }));

    await waitFor(() => {
      expect(requestMocks.approvePullRequestReplicated).toHaveBeenCalledWith('entry-def');
    });
    expect(dayOfOpsMocks.updateRefundStatus).not.toHaveBeenCalled();
  });
});
