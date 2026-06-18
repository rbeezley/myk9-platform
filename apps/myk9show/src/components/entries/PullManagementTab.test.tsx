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

// Paid online entry — refund button should appear and checkbox should pre-check.
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

// Non-online entry — no payment intent, no refund path.
const offlineEntry: ScratchRequest = {
  ...onlineEntry,
  id: 'entry-def',
  payment_status: null,
  stripe_payment_intent_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({ data: [], error: null });
  dayOfOpsMocks.getScratchedEntries.mockResolvedValue({ data: [], error: null });
  requestMocks.approvePullRequestReplicated.mockResolvedValue({ error: null });
  requestMocks.denyPullRequestReplicated.mockResolvedValue({ error: null });
  mockSupabase.functions.invoke.mockResolvedValue({ data: { amount_cents: 3200 }, error: null });
});

describe('PullManagementTab — approve dialog refund checkbox', () => {
  it('pre-checks the refund box for an online-paid entry (payment_status=paid + payment intent)', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [onlineEntry],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByRole('checkbox', { name: /process refund/i })).toBeChecked();
  });

  it('does not pre-check the refund box when there is no payment intent', async () => {
    dayOfOpsMocks.getPendingScratchRequests.mockResolvedValue({
      data: [offlineEntry],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByRole('checkbox', { name: /process refund/i })).not.toBeChecked();
  });

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

describe('PullManagementTab — Process Refund dialog calls stripe-refund-entry', () => {
  it('calls stripe-refund-entry with entry_id and amount_cents when secretary processes a refund', async () => {
    dayOfOpsMocks.getScratchedEntries.mockResolvedValue({
      data: [onlineEntry],
      error: null,
    });
    const user = userEvent.setup();

    render(<PullManagementTab showId="show-1" />);

    // Switch to Processed tab
    await user.click(await screen.findByRole('tab', { name: /processed/i }));
    await user.click(await screen.findByRole('button', { name: /process refund/i }));

    // Confirm in the dialog — last button with that label is the submit
    const dialogButtons = screen.getAllByRole('button', { name: /process refund/i });
    await user.click(dialogButtons[dialogButtons.length - 1]);

    await waitFor(() => {
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('stripe-refund-entry', {
        body: { entry_id: 'entry-abc', amount_cents: 3200 },
      });
    });
  });
});
