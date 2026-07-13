import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { WaitListEntry } from '@/types/waitlist-types';
import { WaitListSection } from './WaitListSection';

const ACTIVE_OFFER: WaitListEntry = {
  id: 'offer-1',
  classId: 'class-1',
  className: 'Novice Agility',
  showName: 'Fall Trial',
  exhibitorId: 'exhibitor-1',
  exhibitorName: 'Ada Handler',
  dogId: 'dog-1',
  dogName: 'Scout',
  handlerId: null,
  position: 1,
  status: 'offered',
  offeredAt: '2026-07-13T10:00:00.000Z',
  offerExpiresAt: '2026-07-14T10:00:00.000Z',
  promotedEntryId: 'entry-1',
  createdAt: '2026-07-01T10:00:00.000Z',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-13T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderSection(overrides: Partial<React.ComponentProps<typeof WaitListSection>> = {}) {
  const props: React.ComponentProps<typeof WaitListSection> = {
    entries: [ACTIVE_OFFER],
    isLoading: false,
    onWithdraw: vi.fn(),
    isWithdrawing: false,
    onStartPayment: vi.fn(),
    onDecline: vi.fn(),
    payingEntryId: null,
    decliningOfferId: null,
    paymentError: null,
    paymentErrorOfferId: null,
    declineError: null,
    declineErrorOfferId: null,
    focusedOfferId: null,
    onOfferDeadlineElapsed: vi.fn(),
    ...overrides,
  };
  return { ...render(<WaitListSection {...props} />), props };
}

describe('WaitListSection offered payment recovery', () => {
  it('keeps payment and decline on the existing offer row with touch-sized controls', () => {
    renderSection();

    expect(screen.getByText('Spot offered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete payment' })).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Decline' })).toHaveClass('min-h-[44px]');
  });

  it('keeps an active offer visible and exposes a calm retry after a payment-link failure', async () => {
    const { props } = renderSection({
      paymentError: 'The network is unavailable.',
      paymentErrorOfferId: 'offer-1',
    });

    expect(screen.getByText('Your spot is still held. Please try payment again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try payment again' }));
    expect(props.onStartPayment).toHaveBeenCalledWith('entry-1', 'offer-1');
  });

  it('shows retry state only on the offer whose payment failed', () => {
    renderSection({
      entries: [{ ...ACTIVE_OFFER }, { ...ACTIVE_OFFER, id: 'offer-2', dogName: 'Rally' }],
      paymentError: 'The network is unavailable.',
      paymentErrorOfferId: 'offer-1',
    });

    expect(screen.getByRole('region', { name: /waitlist offer for scout/i })).toHaveTextContent(
      'Try payment again'
    );
    expect(screen.getByRole('region', { name: /waitlist offer for rally/i })).toHaveTextContent(
      'Complete payment'
    );
  });

  it('does not start checkout for an expired offer', () => {
    const { props } = renderSection({
      entries: [{ ...ACTIVE_OFFER, status: 'expired', offerExpiresAt: '2026-07-12T10:00:00.000Z' }],
    });

    expect(screen.getByText('This offer has expired.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete payment' })).not.toBeInTheDocument();
    expect(props.onStartPayment).not.toHaveBeenCalled();
  });

  it('revalidates rather than guessing when a device clock reaches an offered deadline', () => {
    const { props } = renderSection({
      entries: [{ ...ACTIVE_OFFER, offerExpiresAt: '2026-07-12T10:00:00.000Z' }],
    });

    expect(screen.getByText('Checking whether this offer is still available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete payment' })).not.toBeInTheDocument();
    expect(props.onOfferDeadlineElapsed).toHaveBeenCalled();
  });

  it('keeps rechecking an elapsed offer until the server reports its terminal state', () => {
    const { props, rerender } = renderSection({
      entries: [{ ...ACTIVE_OFFER, offerExpiresAt: '2026-07-12T10:00:00.000Z' }],
    });

    vi.advanceTimersByTime(30_000);
    expect(props.onOfferDeadlineElapsed).toHaveBeenCalledTimes(2);

    rerender(
      <WaitListSection
        {...props}
        entries={[{ ...ACTIVE_OFFER, status: 'expired', offerExpiresAt: '2026-07-12T10:00:00.000Z' }]}
      />
    );
    expect(screen.getByText('This offer has expired.')).toBeInTheDocument();
  });

  it('focuses the deep-linked offer without exposing any other row', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    renderSection({ focusedOfferId: 'offer-1' });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(screen.getByRole('region', { name: /waitlist offer for scout/i })).toHaveFocus();
  });

  it('does not re-scroll the deep-linked offer after a waitlist refetch', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const { props, rerender } = renderSection({ focusedOfferId: 'offer-1' });
    rerender(<WaitListSection {...props} entries={[{ ...ACTIVE_OFFER }]} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
