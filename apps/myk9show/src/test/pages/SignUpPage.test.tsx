import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    mockSignUp.mockResolvedValue(undefined);
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

  it('frames elevated signup roles as access requests', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    expect(screen.getByText('I am interested in...')).toBeInTheDocument();
    expect(screen.getByLabelText('I show dogs')).toBeChecked();
    expect(screen.getByLabelText('I help run a club or host shows')).toBeInTheDocument();
    expect(screen.getByLabelText('I work as a show secretary')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Club access requires approval. Secretaries are added by an approved club admin after their club is approved.'
      )
    ).toBeInTheDocument();
  });

  it('requires a club name when requesting club admin access', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText('I help run a club or host shows'));
    await user.type(screen.getByLabelText('First name'), 'Jane');
    await user.type(screen.getByLabelText('Last name'), 'Doe');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.click(screen.getByLabelText(/I agree to the/i));
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText('Enter the club name you want to manage.')).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits club access request metadata', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    await user.click(screen.getByLabelText('I help run a club or host shows'));
    await user.type(screen.getByLabelText('First name'), 'Jane');
    await user.type(screen.getByLabelText('Last name'), 'Doe');
    await user.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');
    await user.type(screen.getByLabelText('Club name'), 'River City Scent Work Club');
    await user.type(screen.getByLabelText('Club website'), 'https://rivercity.example');
    await user.type(screen.getByLabelText('Note for myK9'), 'I am the trial chair.');
    await user.click(screen.getByLabelText(/I agree to the/i));
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(mockSignUp).toHaveBeenCalledWith('jane@example.com', 'password123', {
      firstName: 'Jane',
      lastName: 'Doe',
      roles: ['exhibitor', 'club_officer'],
      requestedClubName: 'River City Scent Work Club',
      requestedClubWebsite: 'https://rivercity.example',
      clubRequestNote: 'I am the trial chair.',
    });
  });

  it('preselects club request mode from the request query parameter', () => {
    render(
      <MemoryRouter initialEntries={['/sign-up?request=club']}>
        <SignUpPage />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('I help run a club or host shows')).toBeChecked();
    expect(screen.getByLabelText('Club name')).toBeInTheDocument();
  });
});
