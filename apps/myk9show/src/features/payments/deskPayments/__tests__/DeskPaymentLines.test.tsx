import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DeskPaymentLines } from '../DeskPaymentLines';
import type { DeskPaymentLine, DeskPaymentState, LocalDeskPayment } from '../deskPaymentTypes';
import type { DeskPaymentLinesState } from '../useDeskPaymentLines';

const hook = vi.hoisted(() => ({
  state: {
    lines: [],
    busyId: null,
    unreadable: false,
    tryAgain: vi.fn(),
    remove: vi.fn(),
  } as DeskPaymentLinesState,
  calls: [] as unknown[][],
}));

vi.mock('../useDeskPaymentLines', () => ({
  useDeskPaymentLines: (...args: unknown[]) => {
    hook.calls.push(args);
    return hook.state;
  },
}));

const PAYMENT: LocalDeskPayment = {
  id: 'pay-1',
  showId: 'show-1',
  enrollmentId: 'enr-1',
  exhibitorName: 'Jane Smith',
  amount: 25,
  method: 'cash',
  receivedOn: '2026-11-26',
  reference: null,
  receivedAt: '2026-11-26T15:14:00.000Z',
  sendBegun: false,
};

function renderLine(
  state: DeskPaymentState,
  extra: Partial<DeskPaymentLine> = {},
  unreadable = false
) {
  const line: DeskPaymentLine = { payment: PAYMENT, state, ...extra };
  hook.state = { lines: [line], busyId: null, unreadable, tryAgain: vi.fn(), remove: vi.fn() };
  render(<DeskPaymentLines showId="show-1" enrollmentId="enr-1" />);
  return { line, ...hook.state };
}

describe('DeskPaymentLines (MYK9-2479)', () => {
  it('renders nothing when this device holds no payment for the form', () => {
    hook.state = { lines: [], busyId: null, unreadable: false, tryAgain: vi.fn(), remove: vi.fn() };
    render(<DeskPaymentLines showId="show-1" enrollmentId="enr-1" />);

    expect(screen.queryByTestId('desk-payment-line')).not.toBeInTheDocument();
    expect(hook.calls.at(-1)).toEqual(['show-1', 'enr-1']);
  });

  it('waiting to send promises an automatic send and offers nothing to press', () => {
    renderLine('waiting');

    expect(screen.getByTestId('desk-payment-line')).toHaveTextContent(
      /^Cash \$25\.00 received at .+, waiting to send\.$/
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('not confirmed while queued says it will be sent again on its own, with no Try again', () => {
    renderLine('unconfirmed');

    expect(screen.getByTestId('desk-payment-line')).toHaveTextContent(
      /, not confirmed\. It will be sent again on its own\.$/
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('stopped, it says it will not send on its own and offers Try again only', () => {
    const { line, tryAgain } = renderLine('unconfirmed-stopped', { failedMutationId: 'mut-1' });

    expect(screen.getByTestId('desk-payment-line')).toHaveTextContent(
      /, not confirmed\. It will not be sent on its own\.Try again$/
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(tryAgain).toHaveBeenCalledWith(line);
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('not checked says this device cannot confirm it, and offers Try again, never Remove', () => {
    renderLine('not-checked', { failedMutationId: 'mut-1' });

    expect(screen.getByTestId('desk-payment-line')).toHaveTextContent(
      'This device cannot confirm it, and it will not be sent on its own.'
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  // Codex round 1 on #4461: an unreadable queue is not an empty one.
  it('an unreadable device says so, keeps its known lines and stops their actions', () => {
    renderLine('unconfirmed-stopped', { failedMutationId: 'mut-1' }, true);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This device could not read its saved payments. Do not record a payment for this form again until it can.'
    );
    expect(screen.getByTestId('desk-payment-line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('says so even when it has never read a line', () => {
    hook.state = { lines: [], busyId: null, unreadable: true, tryAgain: vi.fn(), remove: vi.fn() };
    render(<DeskPaymentLines showId="show-1" enrollmentId="enr-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This device could not read its saved payments.'
    );
    expect(screen.queryByTestId('desk-payment-line')).not.toBeInTheDocument();
  });

  it('a proven refusal says why it could not be sent and offers Remove only', () => {
    const { line, remove } = renderLine('refused', {
      failedMutationId: 'mut-1',
      reason: 'a payment amount must be greater than zero',
    });

    expect(screen.getByTestId('desk-payment-line')).toHaveTextContent(
      /, could not be sent: a payment amount must be greater than zero\.Remove$/
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(remove).toHaveBeenCalledWith(line);
  });
});
