import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { render, screen, userEvent, waitFor, within } from '@/test/utils/testUtils';
import { RefundRequestsSection } from './RefundRequestsSection';
import {
  useApproveRefundRequest,
  useRefundRequests,
  useResolveRefundRequest,
} from '@/features/admin-system-health/useRefundRequests';
import {
  approvalErrorMessage,
  resolutionErrorMessage,
  type RefundRequest,
} from '@/features/admin-system-health/refundRequestsPresentation';

vi.mock('@/features/admin-system-health/useRefundRequests', () => ({
  useRefundRequests: vi.fn(),
  useApproveRefundRequest: vi.fn(),
  useResolveRefundRequest: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockedQuery = vi.mocked(useRefundRequests);
const mockedApprove = vi.mocked(useApproveRefundRequest);
const mockedResolve = vi.mocked(useResolveRefundRequest);

function request(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: 'rr-1',
    kind: 'abandoned_cart',
    status: 'pending',
    amountCents: 4250,
    reason: 'cart_abandoned',
    paymentIntentId: 'pi_123',
    checkoutSessionId: 'cs_123',
    createdAt: new Date().toISOString(),
    lastFailure: null,
    ...overrides,
  };
}

function withData(data: RefundRequest[]) {
  mockedQuery.mockReturnValue({ data, isLoading: false, error: null } as unknown as ReturnType<
    typeof useRefundRequests
  >);
}

describe('RefundRequestsSection', () => {
  const mutateAsync = vi.fn();
  const resolveAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    resolveAsync.mockReset();
    mockedResolve.mockReturnValue({
      mutateAsync: resolveAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useResolveRefundRequest>);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    mockedApprove.mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useApproveRefundRequest
    >);
  });

  it('says so when nothing is waiting', () => {
    withData([]);
    render(<RefundRequestsSection />);
    expect(screen.getByText('No refunds waiting.')).toBeInTheDocument();
  });

  it('approves ONE refund only after the confirmation, never on the first click', async () => {
    mutateAsync.mockResolvedValue('refunded');
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);

    expect(screen.getByText('Paid after the cart was abandoned')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve refund' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be taken back');
    await user.click(screen.getByRole('button', { name: 'Refund $42.50' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('rr-1'));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Refunded $42.50 to the payer's card.")
    );
  });

  it('cancelling the confirmation refunds nothing', async () => {
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);
    await user.click(screen.getByRole('button', { name: 'Approve refund' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('surfaces a refused approval instead of claiming success', async () => {
    mutateAsync.mockRejectedValue(new Error(approvalErrorMessage('fulfilled')));
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);
    await user.click(screen.getByRole('button', { name: 'Approve refund' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Refund $42.50' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(approvalErrorMessage('fulfilled'))
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says a still-processing refund is submitted, not refunded (Codex P1, #2689)', async () => {
    mutateAsync.mockResolvedValue('pending');
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);
    await user.click(screen.getByRole('button', { name: 'Approve refund' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Refund $42.50' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Refund of $42.50 submitted. Stripe is still processing it; it leaves this list once it succeeds.'
      )
    );
  });

  it('shows a refund Stripe failed, with the reason, and offers Approve again', () => {
    withData([request({ status: 'failed', lastFailure: 'failed: expired_or_canceled_card' })]);
    render(<RefundRequestsSection />);
    expect(screen.getByText(/failed: expired_or_canceled_card/)).toBeInTheDocument();
    expect(screen.getByText(/The customer was not paid/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve again' })).toBeInTheDocument();
  });

  it('labels a request waiting on Stripe as submitted, with Check status', () => {
    withData([request({ status: 'awaiting_stripe' })]);
    render(<RefundRequestsSection />);
    expect(screen.getByText(/submitted to Stripe, not finished yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument();
  });
});

describe('Resolve without refund (Codex round 6, #2689)', () => {
  const approveAsync = vi.fn();
  const resolveAsync = vi.fn();

  beforeEach(() => {
    approveAsync.mockReset();
    resolveAsync.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    mockedApprove.mockReturnValue({
      mutateAsync: approveAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useApproveRefundRequest>);
    mockedResolve.mockReturnValue({
      mutateAsync: resolveAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useResolveRefundRequest>);
  });

  it('resolves only after the confirmation AND a note, and never approves', async () => {
    resolveAsync.mockResolvedValue(undefined);
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);

    await user.click(screen.getByRole('button', { name: 'Resolve without refund' }));
    expect(resolveAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('can never be approved for a refund');

    const confirm = within(dialog).getByRole('button', { name: 'Resolve without refund' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/How was the charge honored/), '  ');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/How was the charge honored/), 'Paid by hand');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() =>
      expect(resolveAsync).toHaveBeenCalledWith({ requestId: 'rr-1', note: 'Paid by hand' })
    );
    expect(resolveAsync).toHaveBeenCalledTimes(1);
    expect(approveAsync).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Resolved without refund. The $42.50 will not be refunded.'
      )
    );
  });

  it('cancelling resolves nothing', async () => {
    withData([request()]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);
    await user.click(screen.getByRole('button', { name: 'Resolve without refund' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(resolveAsync).not.toHaveBeenCalled();
  });

  it('surfaces a refused resolution and keeps the dialog open', async () => {
    resolveAsync.mockRejectedValue(new Error(resolutionErrorMessage('has_live_attempt')));
    withData([request({ status: 'failed', lastFailure: 'failed: x' })]);
    const user = userEvent.setup();
    render(<RefundRequestsSection />);
    await user.click(screen.getByRole('button', { name: 'Resolve without refund' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByLabelText(/How was the charge honored/), 'n');
    await user.click(within(dialog).getByRole('button', { name: 'Resolve without refund' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(resolutionErrorMessage('has_live_attempt'))
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('is offered beside Approve for pending and failed rows, never while Stripe holds a refund', () => {
    withData([
      request({ id: 'a' }),
      request({ id: 'b', status: 'failed', lastFailure: 'failed: x' }),
      request({ id: 'c', status: 'awaiting_stripe' }),
    ]);
    render(<RefundRequestsSection />);
    expect(screen.getAllByRole('button', { name: 'Resolve without refund' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Check status' })).toBeInTheDocument();
  });
});

describe('approvalErrorMessage', () => {
  it('maps every server code, and never says "nothing was refunded" when it cannot know', () => {
    expect(approvalErrorMessage('fulfilled')).toMatch(/fulfilled with entries/);
    expect(approvalErrorMessage('stripe_refund_canceled')).toMatch(
      /Stripe reports this refund was canceled/
    );
    expect(approvalErrorMessage(undefined)).not.toMatch(/Nothing was refunded/);
    expect(approvalErrorMessage('resolved_without_refund')).toMatch(/resolved without a refund/);
  });
});
