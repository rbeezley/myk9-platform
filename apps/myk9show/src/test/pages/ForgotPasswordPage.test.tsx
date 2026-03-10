import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';

// Mock useAuthContext
const mockResetPassword = vi.fn();
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    resetPassword: mockResetPassword,
  }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

  it('renders the reset password form', () => {
    renderPage();
    expect(screen.getByText('Reset your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();
  });

  it('has a link back to sign in', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/sign-in');
  });

  it('submits email and shows success state', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    expect(mockResetPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('shows success even when resetPassword throws (prevents email enumeration)', async () => {
    mockResetPassword.mockRejectedValue(new Error('User not found'));
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });

  it('shows error message on network failure', async () => {
    const networkError = new Error('Failed to fetch');
    networkError.name = 'FetchError';
    mockResetPassword.mockRejectedValue(networkError);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('shows loading state while submitting', async () => {
    let resolveReset: () => void;
    mockResetPassword.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveReset = resolve;
        })
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    resolveReset!();
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
  });

  it('requires email field to be filled', () => {
    renderPage();
    const emailInput = screen.getByLabelText('Email address');
    expect(emailInput).toBeRequired();
  });

  it('shows back to sign in link in success state', async () => {
    mockResetPassword.mockResolvedValue(undefined);
    renderPage();

    await userEvent.type(screen.getByLabelText('Email address'), 'user@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeInTheDocument();
    });
    const link = screen.getByRole('link', { name: /back to sign in/i });
    expect(link).toHaveAttribute('href', '/sign-in');
  });
});
