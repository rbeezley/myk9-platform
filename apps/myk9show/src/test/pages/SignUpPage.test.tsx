import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SignUpPage from '@/pages/SignUpPage';

const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: mockSignUp,
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
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

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  describe('TOS Agreement Checkbox', () => {
    it('renders a TOS agreement checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByLabelText(/I agree to the/i)).toBeInTheDocument();
      expect(screen.getByText(/I agree to the/)).toBeInTheDocument();
    });

    it('renders links to Terms of Service and Privacy Policy', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      const tosLink = screen.getByRole('link', { name: /terms of service/i });
      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(tosLink).toHaveAttribute('href', '/terms');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('disables Sign up button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /sign up/i })).toBeDisabled();
    });

    it('disables Continue with Google button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
    });

    it('enables Sign up button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      expect(screen.getByRole('button', { name: /sign up/i })).not.toBeDisabled();
    });

    it('enables Continue with Google button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      expect(screen.getByRole('button', { name: /continue with google/i })).not.toBeDisabled();
    });

    it('calls signInWithGoogle when Google button is clicked after checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });

    it('does not call signInWithGoogle when Google button is clicked without checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      const googleBtn = screen.getByRole('button', { name: /continue with google/i });
      fireEvent.click(googleBtn);
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe('elevated role requests', () => {
    it('explains that club officer and secretary access requires approval', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      expect(screen.getByText(/request access as/i)).toBeInTheDocument();
      expect(
        screen.getByText(/club officer and secretary access requires approval/i)
      ).toBeInTheDocument();
    });

    it('passes selected elevated roles as signup intent without granting access client-side', async () => {
      const user = userEvent.setup();
      mockSignUp.mockResolvedValue(undefined);

      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/first name/i), 'Pat');
      await user.type(screen.getByLabelText(/last name/i), 'Morgan');
      await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      await user.click(screen.getByLabelText(/club officer/i));
      await user.click(screen.getByLabelText(/show secretary/i));
      await user.click(screen.getByLabelText(/i agree to the/i));
      await user.click(screen.getByRole('button', { name: /sign up/i }));

      expect(mockSignUp).toHaveBeenCalledWith('pat@example.com', 'password123', {
        firstName: 'Pat',
        lastName: 'Morgan',
        roles: ['exhibitor', 'club_officer', 'secretary'],
      });
    });
  });
});
