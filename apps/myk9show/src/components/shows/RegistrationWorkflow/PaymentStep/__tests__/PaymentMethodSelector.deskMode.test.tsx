import { describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentMethodSelector } from '../PaymentMethodSelector';

/**
 * MYK9-2020: the secretary keying a mail-in entry sees one list of payment
 * choices in her own words, grouped Paid / Not paid yet. The server-side rules
 * these choices feed (MYK9-677 cash-or-check, MYK9-1875 free entry) are pinned
 * in their own tests; this file pins what she sees and what each choice sends.
 */
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const deskProps = {
  deskMode: true,
  allowCardCheckout: false,
  allowFreeEntry: true,
  acceptedMethods: { check: true, cash: true },
};

describe('PaymentMethodSelector desk mode (MYK9-2020)', () => {
  it('records a posted check as money received by check, from one click', () => {
    const onPaymentMethodChange = vi.fn();
    const onPaymentDetailsChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod=""
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Check received/ }));

    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'check' })
    );
  });

  it('records cash in hand as money received by cash', () => {
    const onPaymentMethodChange = vi.fn();
    const onPaymentDetailsChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod=""
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cash received/ }));

    expect(onPaymentMethodChange).toHaveBeenCalledWith('secretary_paid');
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'cash' })
    );
  });

  it('asks for the check number of a received check, stored as the payment reference', () => {
    const onPaymentDetailsChange = vi.fn();
    const { rerender } = render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod=""
        onPaymentMethodChange={vi.fn()}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Check received/ }));
    rerender(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod="secretary_paid"
        onPaymentMethodChange={vi.fn()}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    expect(screen.getByRole('button', { name: /Check received/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.change(screen.getByLabelText('Check number'), { target: { value: '4417' } });
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ receivedMethod: 'check', paymentReference: '4417' })
    );
  });

  it('offers each choice once, with no second desk block and no exhibitor wording', () => {
    render(
      <PaymentMethodSelector {...deskProps} paymentMethod="" onPaymentMethodChange={vi.fn()} />
    );

    const names = screen
      .getAllByRole('button')
      .map(button => button.querySelector('.font-medium')?.textContent);
    expect(names).toEqual([
      'Check received',
      'Cash received',
      'Paid by a club or group',
      'Check (pay at show)',
      'Cash (pay at show)',
      'Free entry',
    ]);
    expect(screen.queryByText(/Secretary Payment/)).toBeNull();
    expect(screen.queryByText('Received as')).toBeNull();
    expect(screen.queryByText(/Bring check made payable/)).toBeNull();
    expect(screen.queryByText(/Exact amount required/)).toBeNull();
  });

  it('puts paid and not-paid-yet choices under separate headings', () => {
    render(
      <PaymentMethodSelector {...deskProps} paymentMethod="" onPaymentMethodChange={vi.fn()} />
    );

    const paid = screen.getByRole('region', { name: 'Paid' });
    const unpaid = screen.getByRole('region', { name: 'Not paid yet' });
    expect(within(paid).getByRole('button', { name: /Check received/ })).toBeInTheDocument();
    expect(within(paid).getByRole('button', { name: /Cash received/ })).toBeInTheDocument();
    expect(within(paid).queryByRole('button', { name: /pay at show/ })).toBeNull();
    expect(
      within(unpaid).getByRole('button', { name: /Check \(pay at show\)/ })
    ).toBeInTheDocument();
    expect(
      within(unpaid).getByRole('button', { name: /Cash \(pay at show\)/ })
    ).toBeInTheDocument();
    expect(within(unpaid).queryByRole('button', { name: /received/ })).toBeNull();
  });

  it('records a not-yet-paid check as the pay-at-show method', () => {
    const onPaymentMethodChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod=""
        onPaymentMethodChange={onPaymentMethodChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Check \(pay at show\)/ }));

    expect(onPaymentMethodChange).toHaveBeenCalledWith('check');
  });

  it('asks which way the money came when the mail-in default has not named it', () => {
    render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod="secretary_paid"
        onPaymentMethodChange={vi.fn()}
      />
    );

    expect(screen.getByText(/choose Check received or Cash received/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check received/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('keeps a retained received method selected when the step remounts', () => {
    render(
      <PaymentMethodSelector
        {...deskProps}
        paymentMethod="secretary_paid"
        onPaymentMethodChange={vi.fn()}
        getInitialDetails={() => ({ receivedMethod: 'cash', paymentReference: 'R-9' })}
      />
    );

    expect(screen.getByRole('button', { name: /Cash received/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Receipt #')).toHaveValue('R-9');
  });

  it('hides Free entry when the caller does not allow it', () => {
    render(
      <PaymentMethodSelector
        {...deskProps}
        allowFreeEntry={false}
        paymentMethod=""
        onPaymentMethodChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Free entry/ })).toBeNull();
  });
});

describe('PaymentMethodSelector exhibitor path is unchanged (MYK9-2020)', () => {
  it('shows the exhibitor the same choices and wording as before', () => {
    render(
      <PaymentMethodSelector
        paymentMethod="check"
        onPaymentMethodChange={vi.fn()}
        acceptedMethods={{ check: true, cash: true }}
      />
    );

    expect(screen.getByText('Credit/Debit Card')).toBeInTheDocument();
    expect(screen.getByText('Bring check made payable to hosting club')).toBeInTheDocument();
    expect(screen.getByText('Exact amount required at check-in')).toBeInTheDocument();
    expect(
      screen.getByText(/Please bring your check made payable to the hosting club/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Paid' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Not paid yet' })).toBeNull();
    expect(screen.queryByText('Check received')).toBeNull();
  });
});
