import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import AccountStatusDialog from './AccountStatusDialog';

describe('AccountStatusDialog', () => {
  it('keeps the existing suspension warning and confirms the action', async () => {
    const onConfirm = vi.fn();
    const { user } = render(
      <AccountStatusDialog
        open
        onOpenChange={vi.fn()}
        userName="Ada Lovelace"
        status="active"
        onConfirm={onConfirm}
      />
    );

    expect(
      screen.getByText('This will immediately block Ada Lovelace from logging in. Continue?')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('changes the action and wording for a suspended account', () => {
    render(
      <AccountStatusDialog
        open
        onOpenChange={vi.fn()}
        userName="Ada Lovelace"
        status="suspended"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/restore Ada Lovelace's ability to sign in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinstate account' })).toBeInTheDocument();
  });
});
