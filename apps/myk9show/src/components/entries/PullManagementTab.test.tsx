import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { PullManagementTab } from './PullManagementTab';
import type { PullRecord } from '@/services/database/day-of-operations';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dayOfOpsMocks = vi.hoisted(() => ({
  getPendingPullRequests: vi.fn(),
  getPulledEntries: vi.fn(),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getPendingPullRequests: dayOfOpsMocks.getPendingPullRequests,
  getPulledEntries: dayOfOpsMocks.getPulledEntries,
}));

const requestMocks = vi.hoisted(() => ({
  approvePullRequestReplicated: vi.fn(),
  denyPullRequestReplicated: vi.fn(),
}));

vi.mock('@/services/show-day/requestManagement', () => ({
  approvePullRequestReplicated: requestMocks.approvePullRequestReplicated,
  denyPullRequestReplicated: requestMocks.denyPullRequestReplicated,
}));

const onlineEntry: PullRecord = {
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
  pull_timing: null,
  dog: { id: 'dog-1', name: 'Buddy', call_name: 'Buddy' },
  class: { id: 'class-1', name: 'Novice A', class_number: '110' },
};

beforeEach(() => {
  vi.clearAllMocks();
  dayOfOpsMocks.getPendingPullRequests.mockResolvedValue({ data: [], error: null });
  dayOfOpsMocks.getPulledEntries.mockResolvedValue({ data: [], error: null });
  requestMocks.approvePullRequestReplicated.mockResolvedValue({ error: null });
  requestMocks.denyPullRequestReplicated.mockResolvedValue({ error: null });
});

describe('PullManagementTab — approve dialog', () => {
  it('approve does not call stripe-refund-entry — it only approves the pull', async () => {
    dayOfOpsMocks.getPendingPullRequests.mockResolvedValue({
      data: [onlineEntry],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await user.click(screen.getByRole('button', { name: /approve pull/i }));

    await waitFor(() => {
      expect(requestMocks.approvePullRequestReplicated).toHaveBeenCalledWith('entry-abc');
    });
  });
});
