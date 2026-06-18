import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { PullManagementTab } from './PullManagementTab';
import { mockSupabase } from '@/test/mocks/supabase';
import type { ScratchRequest } from '@/services/database/day-of-operations';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const dayOfOpsMocks = vi.hoisted(() => ({
  getPendingScratchRequests: vi.fn(),
  getScratchedEntries: vi.fn(),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getPendingScratchRequests: dayOfOpsMocks.getPendingScratchRequests,
  getScratchedEntries: dayOfOpsMocks.getScratchedEntries,
}));

const requestMocks = vi.hoisted(() => ({
  approvePullRequestReplicated: vi.fn(),
  denyPullRequestReplicated: vi.fn(),
}));

vi.mock('@/services/show-day/requestManagement', () => ({
  approvePullRequestReplicated: requestMocks.approvePullRequestReplicated,
  denyPullRequestReplicated: requestMocks.denyPullRequestReplicated,
}));

// Paid online entry — refund button should appear in the Processed tab.
const onlineEntry: ScratchRequest = {
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
  stripe_payment_intent_id: 'pi_test_123',
  dog: { id: 'dog-1', name: 'Buddy', call_name: 'Buddy' },
  class: { id: 'class-1', name: 'Novice A', class_number: '110' },
};

beforeEach(() => {
  vi.clearAllMocks();
  dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({ data: [], error: null });
  dayOfOpsMocks.getScratchedEntries.mockResolvedValue({ data: [], error: null });
  requestMocks.approvePullRequestReplicated.mockResolvedValue({ error: null });
  requestMocks.denyPullRequestReplicated.mockResolvedValue({ error: null });
  mockSupabase.functions.invoke.mockResolvedValue({ data: { amount_cents: 3200 }, error: null });
});

describe('PullManagementTab — approve dialog', () => {
  it('approve does not call stripe-refund-entry — it only approves the pull', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
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
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('PullManagementTab — Process Refund opens RefundEntryDialog', () => {
  it('calls stripe-refund-entry via RefundEntryDialog when secretary issues a refund', async () => {
    dayOfOpsMocks.getScratchedEntries.mockResolvedValue({
      data: [onlineEntry],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    // Switch to Processed tab
    await user.click(await screen.findByRole('tab', { name: /processed/i }));
    await user.click(await screen.findByRole('button', { name: /process refund/i }));

    // RefundEntryDialog is open — click the "Issue refund" submit button
    await user.click(await screen.findByRole('button', { name: /issue refund/i }));

    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: {
          entry_id: 'entry-abc',
          amount_cents: undefined,
          notes: undefined,
        },
      });
    });
  });
});
