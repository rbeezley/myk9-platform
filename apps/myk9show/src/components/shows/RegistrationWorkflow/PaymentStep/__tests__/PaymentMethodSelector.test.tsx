import { render, screen } from '@/test/utils/testUtils';
import { describe, it, expect, vi } from 'vitest';
import { PaymentMethodSelector } from '../PaymentMethodSelector';

const baseProps = {
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
};

describe('PaymentMethodSelector — acceptedMethods filtering', () => {
  it('shows check card when acceptedMethods.check is true', () => {
    render(<PaymentMethodSelector {...baseProps} acceptedMethods={{ check: true, cash: false }} />);
    expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();
  });

  it('hides check card when acceptedMethods.check is false', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.queryByText('Check (pay at show)')).not.toBeInTheDocument();
  });

  it('shows cash card when acceptedMethods.cash is true', () => {
    render(<PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: true }} />);
    expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();
  });

  it('hides cash card when acceptedMethods.cash is false', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.queryByText('Cash (pay at show)')).not.toBeInTheDocument();
  });

  it('shows all methods when acceptedMethods is not provided (default behaviour)', () => {
    render(<PaymentMethodSelector {...baseProps} />);
    expect(screen.getByText('Check (pay at show)')).toBeInTheDocument();
    expect(screen.getByText('Cash (pay at show)')).toBeInTheDocument();
  });

  it('always shows Credit/Debit Card regardless of acceptedMethods', () => {
    render(
      <PaymentMethodSelector {...baseProps} acceptedMethods={{ check: false, cash: false }} />
    );
    expect(screen.getByText('Credit/Debit Card (Online Payment)')).toBeInTheDocument();
  });

  it('tells card payers they will continue to secure checkout', () => {
    render(<PaymentMethodSelector {...baseProps} paymentMethod="credit_card" />);

    expect(
      screen.getByText(/You'll be taken to our secure checkout to complete payment/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Online card payment is coming soon/)).not.toBeInTheDocument();
  });
});
