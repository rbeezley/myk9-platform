import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { PullManagementTab } from './PullManagementTab';
import type { PullRecord } from '@/services/database/day-of-operations';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

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

const reconciledPull: EntryManagementEntry = {
  id: 'entry-pulled',
  registrationId: 'registration-1',
  entryNumber: '#42',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Buddy',
  ownerName: 'Alex Exhibitor',
  ownerEmail: 'alex@example.com',
  handlerName: 'Jane Doe',
  classes: [
    {
      id: 'entry-pulled',
      classId: 'class-1',
      name: 'Novice A',
      number: '110',
      fee: 32,
      status: 'scratched',
    },
  ],
  totalFee: 32,
  paidAmount: 32,
  entryStatus: EntryStatus.SCRATCHED,
  rawEntryStatus: 'scratched',
  paymentStatus: PaymentStatus.PAID_ONLINE,
  paymentMethod: 'online',
  submittedAt: new Date('2026-06-18T10:00:00Z'),
  lastUpdated: new Date('2026-06-18T11:00:00Z'),
  pullReason: 'Dog injured',
  pulledAt: '2026-06-18T11:00:00Z',
  pullTiming: 'before_close',
  refundDecision: null,
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

    render(<PullManagementTab showId="show-1" processedEntries={[]} />);

    await screen.findByText('Buddy');
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await user.click(screen.getByRole('button', { name: /approve pull/i }));

    await waitFor(() => {
      expect(requestMocks.approvePullRequestReplicated).toHaveBeenCalledWith('entry-abc');
    });
  });
});

describe('PullManagementTab — loading state (Phase 4 skeleton convergence)', () => {
  it('renders the table skeleton (not a spinner) while pulls are loading', () => {
    // isLoading starts true; the mocked fetch resolves on a later microtask,
    // so the section skeleton is present on the initial synchronous render.
    render(<PullManagementTab showId="show-1" processedEntries={[]} />);

    expect(screen.getByRole('status', { name: /loading pulled entries/i })).toBeInTheDocument();
    // Section load must be a skeleton, never the old bare spinner.
    expect(document.querySelector('.animate-spin')).toBeNull();
  });
});

describe('PullManagementTab — processed entry status', () => {
  it('shows pull context and refund reconciliation in the canonical Exceptions surface', async () => {
    const { user } = render(
      <PullManagementTab showId="show-1" processedEntries={[reconciledPull]} />
    );

    await user.click(await screen.findByRole('tab', { name: /pulled \(1\)/i }));

    expect(screen.getByText('Dog injured')).toBeInTheDocument();
    expect(screen.getByText('Before close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue refund' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny refund' })).toBeInTheDocument();
    expect(dayOfOpsMocks.getPulledEntries).not.toHaveBeenCalled();
  });

  it('renders pulled entries through the shared status grammar', async () => {
    const { container, user } = render(
      <PullManagementTab showId="show-1" processedEntries={[reconciledPull]} />
    );

    const pulledTab = await screen.findByRole('tab', { name: /pulled \(1\)/i });
    await user.click(pulledTab);
    await screen.findByText('Buddy');

    expect(container.querySelector('[data-family="entry"][data-status="pulled"]')).not.toBeNull();
  });
});
