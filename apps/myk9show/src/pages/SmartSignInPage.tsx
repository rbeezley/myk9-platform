import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Pencil } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { GoogleIcon } from '@/components/icons/GoogleIcon';
import { getSignInReturnTo } from './SignInPage.helpers';
import { classifyCredential, normalizeCredential } from './SmartSignInPage.helpers';
import { PasswordSubForm } from './PasswordSubForm';
import { JoinShowConfirmation } from './JoinShowConfirmation';
import { validatePasscode } from './validatePasscode';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import type { UserRole as RingsideRole } from '@myk9/ringside';

const INVALID_COPY =
  'That doesn’t look like an email or a show passcode. Passcodes are 5 characters and start with a letter — for example, aa260.';

type PendingPasscode = { showId: string; showName: string; role: RingsideRole };

/**
 * SmartSignInPage — the single email-or-passcode front door (Phase 1b).
 *
 * One field disambiguates client-side (see `classifyCredential`): an email
 * reveals the password step in place (reusing `PasswordSubForm`); a valid
 * passcode is validated server-side, then — for a signed-in account — routed
 * through the §2.2 confirmation that attaches a show-scoped ringside grant
 * (Phase 1c). Anonymous passcodes route straight to `/at-show/:showId`.
 *
 * INTENT: respects the clock (≤2 taps), plain language, no jargon, visible
 * labels, `aria-live` on every transition. The confirmation is the ONLY added
 * prompt and only for the rare signed-in-types-passcode case.
 */
const SmartSignInPage: React.FC = () => {
  const [credential, setCredential] = useState('');
  const [step, setStep] = useState<'input' | 'password'>('input');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pending, setPending] = useState<PendingPasscode | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, firstName, signIn, signInWithGoogle, loading: authLoading } = useAuthContext();
  const setGrant = useRingsideGrantStore(state => state.setGrant);

  const isLoading = loading || authLoading;
  const kind = useMemo(() => classifyCredential(credential), [credential]);
  const canContinue = kind === 'email' || kind === 'passcode';

  // Programmatic focus to the password field when the email branch reveals it.
  useEffect(() => {
    if (step === 'password') document.getElementById('password')?.focus();
  }, [step]);

  const liveHint =
    kind === 'email'
      ? "Looks like an email — we'll ask for your password next"
      : kind === 'passcode'
        ? "Looks like a show passcode — you'll be signed in"
        : '';

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (kind === 'email') {
      setStep('password');
      return;
    }
    if (kind !== 'passcode') {
      setError(INVALID_COPY);
      return;
    }

    setLoading(true);
    try {
      const result = await validatePasscode(normalizeCredential(credential));
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (user) {
        // Signed-in account: confirm before expanding role (Phase 1c §2.2).
        setPending({ showId: result.showId, showName: result.showName, role: result.role });
      } else {
        // Anonymous: route straight to ringside (Phase 1d table).
        navigate(`/at-show/${result.showId}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(normalizeCredential(credential), password);
      navigate(getSignInReturnTo(searchParams));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmJoin = () => {
    if (!pending) return;
    setIsJoining(true);
    setGrant({ showId: pending.showId, role: pending.role, source: 'passcode' });
    navigate(`/at-show/${pending.showId}`);
  };

  const editCredential = () => {
    setStep('input');
    setPassword('');
    setError('');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-2 pt-20">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link
            to="/"
            className="text-3xl font-bold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded transition"
          >
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2 text-center">Sign in or join a show</h2>
        <div className="text-muted-foreground text-center mb-6">
          Don't have an account?{' '}
          <Link to="/sign-up" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </div>

        {/* aria-live region announcing branch + step transitions. */}
        <div className="sr-only" aria-live="polite">
          {step === 'password' ? 'Enter your password to sign in.' : liveHint}
        </div>

        {step === 'input' ? (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading || googleLoading}
              className="w-full flex items-center justify-center gap-3 border border-input bg-background text-foreground py-2 px-4 rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <GoogleIcon className="h-5 w-5" />
              Continue with Google
            </button>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-input" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <form onSubmit={handleCredentialSubmit}>
              <div className="mb-1">
                <label className="block mb-1 font-medium" htmlFor="credential">
                  Email or show passcode
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <Mail size={18} />
                  </span>
                  <input
                    type="text"
                    id="credential"
                    data-testid="credential-input"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Email or show passcode"
                    value={credential}
                    onChange={e => {
                      setCredential(e.target.value);
                      if (error) setError('');
                    }}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'credential-error' : undefined}
                    className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                  />
                </div>
              </div>
              {/* Live disambiguation (visible) — empty while invalid/empty. */}
              <div className="min-h-5 mb-3 text-sm text-muted-foreground">{liveHint}</div>

              {error && (
                <div id="credential-error" className="text-destructive mb-4 text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                data-testid="continue-button"
                disabled={!canContinue || isLoading}
                aria-disabled={!canContinue || isLoading}
                className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Checking…' : 'Continue'}
              </button>
            </form>

            <div className="mt-6 text-sm text-muted-foreground space-y-1">
              <p>Have an account? Use your email.</p>
              <p>Working a show? Use the passcode your secretary gave you (5 characters).</p>
            </div>
            <div className="mt-3 text-sm">
              <Link to="/help/credentials" className="text-primary hover:underline">
                Learn how it works &rarr;
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Locked credential chip + edit affordance (INTENT: no hunting). */}
            <div className="flex items-center justify-between mb-4 p-2 pl-3 border border-input rounded-md bg-background">
              <span className="text-foreground truncate" data-testid="locked-credential">
                {normalizeCredential(credential)}
              </span>
              <button
                type="button"
                onClick={editCredential}
                className="flex items-center gap-1 text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded px-1"
              >
                <Pencil size={14} /> Edit
              </button>
            </div>
            <form onSubmit={handlePasswordSubmit}>
              <PasswordSubForm
                password={password}
                onPasswordChange={setPassword}
                showPassword={showPassword}
                onToggleShowPassword={() => setShowPassword(prev => !prev)}
                isLoading={isLoading}
                error={error}
              />
            </form>
          </>
        )}
      </div>

      {pending && (
        <JoinShowConfirmation
          open={!!pending}
          userName={firstName ?? 'you'}
          showName={pending.showName}
          role={pending.role}
          isJoining={isJoining}
          onConfirm={handleConfirmJoin}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default SmartSignInPage;
