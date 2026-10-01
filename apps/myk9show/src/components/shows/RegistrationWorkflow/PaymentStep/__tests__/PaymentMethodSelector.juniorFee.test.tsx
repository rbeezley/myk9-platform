import { render, screen } from '@/test/utils/testUtils';
import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PaymentMethodSelector } from '../PaymentMethodSelector';

// MYK9-878: the secretary's "Charge junior handler fee" choice lives in the existing
// payment step (no new page) and rides on the payment details the wizard already keeps.
const baseProps = {
  paymentMethod: 'cash' as const,
  onPaymentMethodChange: vi.fn(),
};

describe('PaymentMethodSelector junior handler fee choice', () => {
  it('is hidden when the show has no junior fee (or the caller cannot charge it)', () => {
    render(<PaymentMethodSelector {...baseProps} />);
    expect(screen.queryByLabelText(/charge junior handler fee/i)).not.toBeInTheDocument();

    render(<PaymentMethodSelector {...baseProps} juniorFee={null} />);
    expect(screen.queryByLabelText(/charge junior handler fee/i)).not.toBeInTheDocument();
  });

  it('names the fee it would charge', () => {
    render(<PaymentMethodSelector {...baseProps} juniorFee={15} />);

    const box = screen.getByRole('checkbox', { name: /charge junior handler fee/i });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
  });

  it('is a 44px-high touch target: the whole padded row is the label, not the 16px box', () => {
    // docs/INTENT.md: 44x44 minimum on show-desk tablets. The repo asserts the floor by
    // the rendered class (jsdom has no layout), as the CheckInStatusMenu tests do.
    const onPaymentDetailsChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...baseProps}
        juniorFee={15}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    const row = screen.getByText(/charge junior handler fee/i).closest('label');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('min-h-11');
    // The checkbox sits INSIDE that label, so a tap anywhere on the row reaches it.
    expect(row).toContainElement(screen.getByRole('checkbox', { name: /charge junior/i }));

    // Tapping the descriptive text (nowhere near the 16px box) toggles it.
    fireEvent.click(screen.getByText(/applies to every entry you are adding now/i));
    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ chargeJuniorFee: true })
    );
  });

  it('reports the choice in the payment details, alongside what was already typed', () => {
    const onPaymentDetailsChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...baseProps}
        paymentMethod="check"
        juniorFee={15}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    fireEvent.change(screen.getByLabelText(/check number/i), { target: { value: '1042' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /charge junior handler fee/i }));

    expect(onPaymentDetailsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ checkNumber: '1042', chargeJuniorFee: true })
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /charge junior handler fee/i }));

    const last = onPaymentDetailsChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.checkNumber).toBe('1042');
    expect(last.chargeJuniorFee).not.toBe(true);
  });

  it('shows the retained choice as checked when the step remounts (back, then forward)', () => {
    // The wizard keeps the payment details (and submits them) while this step is
    // unmounted; a remount must reflect them, not read as unchecked.
    const retained = { checkNumber: '1042', chargeJuniorFee: true };
    const { unmount } = render(
      <PaymentMethodSelector {...baseProps} paymentMethod="check" juniorFee={15} />
    );
    unmount();

    const onPaymentDetailsChange = vi.fn();
    render(
      <PaymentMethodSelector
        {...baseProps}
        paymentMethod="check"
        juniorFee={15}
        getInitialDetails={() => retained}
        onPaymentDetailsChange={onPaymentDetailsChange}
      />
    );

    expect(screen.getByRole('checkbox', { name: /charge junior handler fee/i })).toBeChecked();
    expect(screen.getByLabelText(/check number/i)).toHaveValue('1042');

    fireEvent.click(screen.getByRole('checkbox', { name: /charge junior handler fee/i }));
    const last = onPaymentDetailsChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.chargeJuniorFee).not.toBe(true);
    expect(last.checkNumber).toBe('1042');
  });
});
