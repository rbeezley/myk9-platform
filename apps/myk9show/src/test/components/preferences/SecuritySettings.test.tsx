import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { SecuritySettings } from '@/components/preferences/SecuritySettings';

const mockUpdatePassword = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ updatePassword: mockUpdatePassword }),
}));

describe('SecuritySettings password form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const submit = () => fireEvent.click(screen.getByRole('button', { name: /update password/i }));
  const fill = (newPw: string, confirmPw: string) => {
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: newPw } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: confirmPw },
    });
  };

  it('shows an inline error and sends no request when submitted with empty fields', () => {
    render(<SecuritySettings />);
    submit();

    expect(screen.getByText(/fill in both password fields/i)).toBeInTheDocument();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows an inline error and sends no request when the password is under 8 characters', () => {
    render(<SecuritySettings />);
    fill('short', 'short');
    submit();

    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('shows an inline error and sends no request when passwords do not match', () => {
    render(<SecuritySettings />);
    fill('longenough1', 'longenough2');
    submit();

    expect(screen.getAllByText(/passwords do not match/i).length).toBeGreaterThanOrEqual(1);
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls updatePassword with the new password when input is valid', async () => {
    mockUpdatePassword.mockResolvedValueOnce(undefined);
    render(<SecuritySettings />);
    fill('longenough1', 'longenough1');
    submit();

    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('longenough1'));
    await waitFor(() =>
      expect(screen.getByText(/password updated successfully/i)).toBeInTheDocument()
    );
  });
});
