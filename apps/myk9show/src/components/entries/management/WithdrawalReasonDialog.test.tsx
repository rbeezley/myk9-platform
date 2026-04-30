import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WithdrawalReasonDialog } from './WithdrawalReasonDialog';

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <select
      data-testid="reason-select"
      onChange={e => onValueChange?.(e.target.value)}
      defaultValue=""
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="" disabled>
      {placeholder}
    </option>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

function renderDialog(props: Partial<React.ComponentProps<typeof WithdrawalReasonDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <WithdrawalReasonDialog
      open={true}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      {...props}
    />
  );
  return { onConfirm, onOpenChange };
}

describe('WithdrawalReasonDialog', () => {
  it('disables Confirm Withdrawal until a reason is selected', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /confirm withdrawal/i })).toBeDisabled();
  });

  it('enables Confirm Withdrawal once a reason is selected', () => {
    renderDialog();
    fireEvent.change(screen.getByTestId('reason-select'), {
      target: { value: 'In-Season Dog' },
    });
    expect(screen.getByRole('button', { name: /confirm withdrawal/i })).not.toBeDisabled();
  });

  it('calls onConfirm with reason only when notes are empty', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByTestId('reason-select'), {
      target: { value: 'Judge Change' },
    });
    await user.click(screen.getByRole('button', { name: /confirm withdrawal/i }));
    expect(onConfirm).toHaveBeenCalledWith('Judge Change');
  });

  it('calls onConfirm with "Reason: notes" when notes are provided', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByTestId('reason-select'), {
      target: { value: 'In-Season Dog' },
    });
    fireEvent.change(screen.getByPlaceholderText(/vet certification/i), {
      target: { value: 'cert on file' },
    });
    await user.click(screen.getByRole('button', { name: /confirm withdrawal/i }));
    expect(onConfirm).toHaveBeenCalledWith('In-Season Dog: cert on file');
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
