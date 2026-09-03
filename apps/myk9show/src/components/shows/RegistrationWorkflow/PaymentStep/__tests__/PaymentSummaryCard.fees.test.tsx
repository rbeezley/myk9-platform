import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentSummaryCard } from '../PaymentSummaryCard';
import { RegistrationSummary } from '../RegistrationSummary';
import { calculateTotalFees } from '../utils';
import type { PaymentSummaryCardProps } from '../types';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';

const state = vi.hoisted(() => ({
  rates: { percent: 7, flatCents: 0, minCents: 0 } as PlatformFeeRates,
}));

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => state.rates,
}));

function fees(classCount = 1, waitlist = false) {
  const classes = Array.from({ length: classCount }, (_, index) => ({
    id: `class-${index}`,
    className: `Class ${index}`,
    entryFee: 30,
  }));
  return calculateTotalFees(
    ['dog-1'],
    [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: classes.map(c => ({ classId: c.id })),
      },
    ],
    [{ id: 'dog-1', name: 'Rover' }],
    classes,
    undefined,
    new Set(waitlist ? classes.map(c => c.id) : [])
  );
}

function Summary(props: Partial<PaymentSummaryCardProps>) {
  return (
    <PaymentSummaryCard
      paymentMethod="credit_card"
      feeCalculation={fees()}
      waiveFees={false}
      feeOverride={null}
      {...props}
    />
  );
}

describe('wizard card fee disclosure (MYK9-367)', () => {
  beforeEach(() => {
    state.rates = { percent: 7, flatCents: 0, minCents: 0 };
  });

  it('quotes $32.10 for a $30 entry at 7%, including the existing fee split', () => {
    render(<Summary />);
    expect(screen.getByText('$32.10')).toBeInTheDocument();
    expect(screen.getByText('Service fee (7%)')).toBeInTheDocument();
    expect(screen.getByText('$2.10')).toBeInTheDocument();
    expect(screen.getByText(/Card processing \(Stripe/)).toBeInTheDocument();
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How our fees work' })).toHaveAttribute(
      'href',
      '/fees'
    );
  });

  it('charges the configured flat component once for multiple classes', () => {
    state.rates = { percent: 10, flatCents: 30, minCents: 100 };
    render(<Summary feeCalculation={fees(3)} />);
    expect(screen.getByText('$99.30')).toBeInTheDocument();
    expect(screen.getByText('$9.30')).toBeInTheDocument();
  });

  it('uses the configured fee floor', () => {
    state.rates = { percent: 1, flatCents: 30, minCents: 250 };
    render(<Summary />);
    expect(screen.getByText('$32.50')).toBeInTheDocument();
  });

  it.each(['check', 'cash', 'secretary_paid', 'group_payment', ''] as const)(
    'removes card fees when the method changes to %s',
    paymentMethod => {
      const { rerender } = render(<Summary />);
      rerender(<Summary paymentMethod={paymentMethod} />);
      expect(screen.getByText('$30.00')).toBeInTheDocument();
      expect(screen.queryByText(/Service fee/)).not.toBeInTheDocument();
      rerender(<Summary />);
      expect(screen.getByText('$32.10')).toBeInTheDocument();
    }
  );

  it.each([{ paymentMethod: 'waived' as const }, { waiveFees: true }])(
    'keeps waived fees at zero: %j',
    props => {
      render(<Summary {...props} />);
      expect(screen.getByText('$0.00 (Waived)')).toBeInTheDocument();
      expect(screen.queryByText(/Service fee/)).not.toBeInTheDocument();
    }
  );

  it('preserves a manual non-card fee override', () => {
    render(<Summary paymentMethod="check" feeOverride={15} />);
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.queryByText(/Service fee/)).not.toBeInTheDocument();
  });

  it('does not charge wait-list-only entries even with a fee floor', () => {
    state.rates = { percent: 7, flatCents: 30, minCents: 250 };
    render(<Summary feeCalculation={fees(2, true)} />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByText(/Service fee/)).not.toBeInTheDocument();
  });

  it('withholds the fee and total while availability is unresolved', () => {
    render(<Summary capacityReady={false} />);
    expect(screen.getByText('Checking availability')).toBeInTheDocument();
    expect(screen.queryByText(/Service fee/)).not.toBeInTheDocument();
    expect(screen.queryByText('$32.10')).not.toBeInTheDocument();
  });

  it('labels the class breakdown as entry fees rather than the full amount due', () => {
    render(<RegistrationSummary feeCalculation={fees()} />);
    expect(screen.getByText('Entry fee total')).toBeInTheDocument();
    expect(screen.queryByText('Total Due')).not.toBeInTheDocument();
  });
});
