/**
 * MYK9-1793 — the email typed on sign-in arrives on the reset page already filled in,
 * carried in router state so it never appears in the URL.
 *
 * Rendered through the real `SignInCredentialForm`, because the one line that decides
 * what is carried (`kind === 'email'`) lives there: a stub that hands the prop straight
 * to `PasswordSubForm` would stay green with that guard deleted.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import ForgotPasswordPage from '../ForgotPasswordPage';
import { SignInCredentialForm } from '../SignInCredentialForm';
import { classifyCredential } from '../SmartSignInPage.helpers';

function SignInRoute({ credential }: { credential: string }) {
  return (
    <SignInCredentialForm
      passcodeOnly={false}
      credential={credential}
      onCredentialChange={vi.fn()}
      kind={classifyCredential(credential)}
      liveHint=""
      describedBy="credential-hint"
      error=""
      errorBelongsToPassword={false}
      onSubmit={vi.fn()}
      canContinue={false}
      isLoading={false}
      showPasswordSection
      showContinueButton={false}
      password=""
      onPasswordChange={vi.fn()}
      showPassword={false}
      onToggleShowPassword={vi.fn()}
      captchaRequired={false}
      captchaToken={null}
      turnstileSiteKey=""
      turnstileRef={null}
      onTokenChange={vi.fn()}
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

async function openResetPageFrom(credential: string) {
  render(
    <Routes>
      <Route path="/" element={<SignInRoute credential={credential} />} />
      <Route path="/forgot-password" element={<ResetRoute />} />
    </Routes>,
    { initialRoute: '/' }
  );
  await userEvent.click(screen.getByRole('link', { name: /forgot your password/i }));
  return screen.findByLabelText(/email address/i);
}

describe('ForgotPasswordPage — email carried from sign-in', () => {
  it('pre-fills the email the person already typed and keeps it out of the URL', async () => {
    expect(await openResetPageFrom(' pat@example.com ')).toHaveValue('pat@example.com');
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/forgot-password$/);
  });

  it('carries nothing when what was typed is not an email', async () => {
    expect(await openResetPageFrom('a12')).toHaveValue('');
  });

  it('starts empty when the sign-in field was empty', async () => {
    expect(await openResetPageFrom('')).toHaveValue('');
  });
});
