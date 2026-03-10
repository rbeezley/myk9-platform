import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SignInPage from '@/pages/SignInPage';

// Mock useAuthContext
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signIn: vi.fn(),
    loading: false,
  }),
}));

describe('SignInPage', () => {
  it('has a forgot password link pointing to /forgot-password', () => {
    render(
      <MemoryRouter>
        <SignInPage />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /forgot your password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });
});
