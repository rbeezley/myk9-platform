import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '@/pages/SignInPage';

const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signIn: vi.fn(),
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignInPage', () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockReset();
  });

  it('has a forgot password link pointing to /forgot-password', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /forgot your password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google button is clicked', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('displays error when signInWithGoogle fails', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('Popup closed'));
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => {
      expect(screen.getByText('Popup closed')).toBeInTheDocument();
    });
  });
});
