import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignUpPage from '@/pages/SignUpPage';

const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: vi.fn(),
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    mockSignInWithGoogle.mockReset();
  });

  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('calls signInWithGoogle when Google button is clicked', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(mockSignInWithGoogle).toHaveBeenCalled();
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });
});
