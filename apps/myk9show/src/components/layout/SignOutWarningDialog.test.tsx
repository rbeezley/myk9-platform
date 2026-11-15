import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { SignOutWarningDialog } from './SignOutWarningDialog';
import type { SignOutWarningContext } from './signOutGuard';

function renderDialog(context: SignOutWarningContext) {
  return render(<SignOutWarningDialog context={context} onCancel={vi.fn()} onConfirm={vi.fn()} />);
}

describe('SignOutWarningDialog (MYK9-2013)', () => {
  it.each(['unsent', 'staff-online', 'offline'] as const)(
    'names the unsent count in the %s mode',
    mode => {
      renderDialog({ mode, unsent: { scores: 2, otherChanges: 0 } });
      expect(screen.getByRole('alertdialog', { name: '2 scores not sent' })).toBeInTheDocument();
      expect(screen.getByText(/keep this phone on and connected/)).toBeInTheDocument();
    }
  );

  it('keeps the offline lockout line next to the count', () => {
    renderDialog({ mode: 'offline', unsent: { scores: 1, otherChanges: 0 } });
    expect(
      screen.getByText(/cannot sign back in until you have internet again/)
    ).toBeInTheDocument();
  });

  it('says the phone could not be checked when the read failed', () => {
    renderDialog({ mode: 'unsent', unsent: null });
    expect(screen.getByRole('alertdialog', { name: 'Sign out?' })).toBeInTheDocument();
    expect(screen.getByText(/could not be checked/)).toBeInTheDocument();
  });

  it('keeps the staff wording when nothing is unsent', () => {
    renderDialog({ mode: 'staff-online', unsent: { scores: 0, otherChanges: 0 } });
    expect(screen.getByText('Sign out before a show?')).toBeInTheDocument();
    expect(screen.queryByText(/not sent/)).not.toBeInTheDocument();
  });
});
