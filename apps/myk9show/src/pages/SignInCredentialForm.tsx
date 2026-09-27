import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { PasswordSubForm } from './PasswordSubForm';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/security/TurnstileChallenge';
import type { CredentialKind } from './SmartSignInPage.helpers';

interface SignInCredentialFormProps {
  passcodeOnly: boolean;
  credential: string;
  onCredentialChange: (value: string) => void;
  kind: CredentialKind;
  liveHint: string;
  describedBy: string;
  error: string;
  errorBelongsToPassword: boolean;
  onSubmit: (e: React.FormEvent) => void;
  canContinue: boolean;
  isLoading: boolean;
  showPasswordSection: boolean;
  showContinueButton: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  captchaRequired: boolean;
  captchaToken: string | null;
  turnstileSiteKey: string;
  turnstileRef: React.Ref<TurnstileChallengeHandle>;
  onTokenChange: (token: string | null) => void;
}

/**
 * The `/sign-in` front door's credential form (MYK9-853): the email-or-
 * passcode field, and — for anything that isn't a passcode — the password
 * field beside it in the same `<form>`, so a browser password manager can
 * fill both and one submit signs in. Once the credential classifies as a
 * passcode, the password field hides and a bare Continue button takes over
 * (`SmartSignInPage` commits that branch on submit).
 *
 * Split out of `SmartSignInPage` to keep that file under the repo's 500-line
 * ceiling — it owns no state of its own, only the credential-classification
 * and submit-handling logic that already lives in the parent.
 */
export const SignInCredentialForm: React.FC<SignInCredentialFormProps> = ({
  passcodeOnly,
  credential,
  onCredentialChange,
  kind,
  liveHint,
  describedBy,
  error,
  errorBelongsToPassword,
  onSubmit,
  canContinue,
  isLoading,
  showPasswordSection,
  showContinueButton,
  password,
  onPasswordChange,
  showPassword,
  onToggleShowPassword,
  captchaRequired,
  captchaToken,
  turnstileSiteKey,
  turnstileRef,
  onTokenChange,
}) => (
  <>
    <form onSubmit={onSubmit}>
      <div className="mb-1">
        <label className="block mb-1 font-medium" htmlFor="credential">
          {passcodeOnly ? 'Show passcode' : 'Email or show passcode'}
        </label>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
            <Mail size={18} />
          </span>
          <input
            type="text"
            id="credential"
            data-testid="credential-input"
            inputMode={passcodeOnly ? 'text' : 'email'}
            autoComplete={passcodeOnly ? 'off' : 'username'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={passcodeOnly ? 'Show passcode' : 'Email or show passcode'}
            value={credential}
            onChange={e => onCredentialChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className="h-11 w-full rounded-md border border-input bg-background p-2 pl-10 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      {/* Live disambiguation (visible) — empty while invalid/empty. */}
      <div id="credential-hint" className="min-h-4 mb-2 text-sm text-muted-foreground">
        {liveHint}
      </div>

      {!errorBelongsToPassword && error && (
        <div id="credential-error" className="text-destructive mb-4 text-center">
          {error}
        </div>
      )}

      {/* The password field sits beside the credential field from the start
          (MYK9-853) so a browser password manager can fill both and one
          submit signs in. It hides only once the credential classifies as a
          passcode. */}
      {showPasswordSection && (
        <>
          {captchaRequired && (
            <TurnstileChallenge
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              action="password_login"
              onTokenChange={onTokenChange}
            />
          )}
          <PasswordSubForm
            password={password}
            onPasswordChange={onPasswordChange}
            showPassword={showPassword}
            onToggleShowPassword={onToggleShowPassword}
            isLoading={isLoading}
            error={errorBelongsToPassword ? error : undefined}
            submitDisabled={(captchaRequired && !captchaToken) || kind !== 'email'}
          />
        </>
      )}

      {showContinueButton && (
        <button
          type="submit"
          data-testid="continue-button"
          disabled={!canContinue || isLoading}
          aria-disabled={!canContinue || isLoading}
          className="h-11 w-full rounded-md bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Checking…' : 'Continue'}
        </button>
      )}
    </form>

    {/* The credentials link is underlined at rest, not just on hover: it sits
        INSIDE this paragraph, and axe's link-in-text-block wants a non-colour
        distinguisher — primary on muted-foreground is 1.01:1, far under the
        3:1 it would otherwise require. */}
    <p id="credential-help" className="mt-2 text-xs sm:text-sm text-muted-foreground">
      Have a passcode? Enter it above.{' '}
      {!passcodeOnly && (
        <Link to="/help/credentials" className="text-primary underline">
          How it works &rarr;
        </Link>
      )}
    </p>
  </>
);
