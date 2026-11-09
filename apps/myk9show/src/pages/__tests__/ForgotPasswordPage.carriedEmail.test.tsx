/**
 * MYK9-1793 — the email typed on sign-in arrives on the reset page already filled in,
 * carried in router state so it never appears in the URL.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import ForgotPasswordPage from '../ForgotPasswordPage';
import { PasswordSubForm } from '../PasswordSubForm';

function SignInStub({ email }: { email?: string | undefined }) {
  return (
    <PasswordSubForm
      password=""
      onPasswordChange={vi.fn()}
      showPassword={false}
      onToggleShowPassword={vi.fn()}
      isLoading={false}
      forgotPasswordEmail={email}
    />
  );
}

function ResetRoute() {
  const location = useLocation();
  return (
    <>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <ForgotPasswordPage />
    </>
  );
}

function renderFlow(email?: string) {
  return render(
    <Routes>
      <Route path="/" element={<SignInStub email={email} />} />
      <Route path="/forgot-password" element={<ResetRoute />} />
    </Routes>,
    { initialRoute: '/' }
  );
}

describe('ForgotPasswordPage — email carried from sign-in', () => {
  it('pre-fills the email the person already typed and keeps it out of the URL', async () => {
    renderFlow('pat@example.com');
    await userEvent.click(screen.getByRole('link', { name: /forgot your password/i }));

    expect(await screen.findByLabelText(/email address/i)).toHaveValue('pat@example.com');
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/forgot-password$/);
  });

  it('starts empty when sign-in had no email to carry', async () => {
    renderFlow();
    await userEvent.click(screen.getByRole('link', { name: /forgot your password/i }));

    expect(await screen.findByLabelText(/email address/i)).toHaveValue('');
  });
});
