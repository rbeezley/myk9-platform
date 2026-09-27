import React, { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import {
  buildSignUpPathForRedirect,
  getShowEntryRedirectShowId,
  getSignInReturnTo,
  persistSignInRedirect,
} from './SignInPage.helpers';
import {
  classifyCredential,
  normalizeCredential,
  resolveLiveHint,
  resolveSignInHeading,
} from './SmartSignInPage.helpers';
import { SignInCredentialForm } from './SignInCredentialForm';
import { PasscodeDetailsForm } from './PasscodeDetailsForm';
import { LockedCredentialChip } from './LockedCredentialChip';
import { SocialSignInButtons } from './SocialSignInButtons';
import { JoinShowConfirmation } from './JoinShowConfirmation';
import { validatePasscode } from './validatePasscode';
import { startAnonymousRingsideSession } from './ringsideAnonSession';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import type { UserRole as RingsideRole } from '@myk9/ringside';
import type { TurnstileChallengeHandle } from '@/components/security/TurnstileChallenge';
import { getTurnstileSiteKey } from '@/config/turnstile';

const INVALID_COPY =
  'That doesn’t look like an email or a show passcode. Passcodes are 5 characters and start with a letter — for example, aa260.';
const INVALID_PASSCODE_COPY =
  'That doesn’t look like a show passcode. Passcodes are 5 characters and start with a letter — for example, aa260.';
const EMPTY_PASSWORD_COPY = 'Enter your password to sign in.';

type PendingPasscode = {
  showId: string;
  showName: string;
  role: RingsideRole;
  passcode: string;
};

/**
 * SmartSignInPage — the single email-or-passcode front door (Phase 1b),
 * with email and password on one screen (MYK9-853).
 *
 * One field disambiguates client-side (see `classifyCredential`): an email
 * keeps the password field beside it (reusing `PasswordSubForm`) in the same
 * `<form>`, so a browser password manager can fill both and one submit signs
 * in. A valid passcode hides the password field and, once committed, is
 * validated server-side, then — for a signed-in account — routed through the
 * §2.2 confirmation that attaches a show-scoped ringside grant (Phase 1c).
 * Anonymous passcodes route straight to `/at-show/:showId`.
 *
 * INTENT: respects the clock (≤2 taps — one submit for email+password),
 * plain language, no jargon, visible labels, `aria-live` on every
 * transition. The signed-in confirmation is the only added prompt for the
 * rare signed-in-types-passcode case. Anonymous passcode users get one
 * OPTIONAL "Your name" field (never required, never an extra tap) so they
 * show a real name in show presence instead of "Judge".
 */
interface SmartSignInPageProps {
  passcodeOnly?: boolean;
}

const SmartSignInPage: React.FC<SmartSignInPageProps> = ({ passcodeOnly = false }) => {
  const [searchParams] = useSearchParams();
  const [credential, setCredential] = useState(() => searchParams.get('code') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [step, setStep] = useState<'input' | 'passcode'>('input');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [pending, setPending] = useState<PendingPasscode | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const submissionPendingRef = useRef(false);

  const navigate = useNavigate();
  const {
    user,
    firstName,
    signIn,
    signInWithGoogle,
    signInWithApple,
    loading: authLoading,
  } = useAuthContext();
  const setGrant = useRingsideGrantStore(state => state.setGrant);

  const isLoading = loading || authLoading;
  const kind = useMemo(() => classifyCredential(credential), [credential]);
  const turnstileSiteKey = getTurnstileSiteKey();
  const captchaRequired = turnstileSiteKey.length > 0;
  // Supabase verifies CAPTCHA when it creates an anonymous Auth user. A reused
  // anonymous session was already admitted through that boundary, so it can be
  // refreshed/re-stamped without consuming an unverified second token.
  const anonymousPasscodeNeedsCaptcha = captchaRequired && kind === 'passcode' && !user;
  const validCredential = passcodeOnly
    ? kind === 'passcode'
    : kind === 'email' || kind === 'passcode';
  // The first step commits a branch; it never carries that branch's own
  // requirements. The account-less passcode CAPTCHA gates the passcode step.
  const canContinue = validCredential;
  const signInReturnTo = useMemo(() => getSignInReturnTo(searchParams), [searchParams]);
  const signUpPath = useMemo(
    () =>
      searchParams.has('redirectTo') || searchParams.has('returnTo')
        ? buildSignUpPathForRedirect(signInReturnTo)
        : '/sign-up',
    [searchParams, signInReturnTo]
  );
  const entryShowId = useMemo(() => getShowEntryRedirectShowId(signInReturnTo), [signInReturnTo]);
  const { data: entryShow } = useShowQuery(entryShowId ?? '');
  const heading = resolveSignInHeading({
    kind,
    step,
    passcodeOnly,
    ...(entryShowId && entryShow?.name ? { entryShowName: entryShow.name } : {}),
  });

  // Once committed, the password field hides and a bare Continue button takes
  // over (passcodeOnly always shows Continue, for any credential shape).
  const showPasswordSection = !passcodeOnly && kind !== 'passcode';
  const showContinueButton = passcodeOnly || kind === 'passcode';
  // A password-field error (wrong password, blank password) belongs beside
  // the field it's about; anything else (invalid shape, a rejected passcode
  // before the branch commits) belongs beside the credential field.
  const errorBelongsToPassword = kind === 'email';

  const liveHint = resolveLiveHint(kind);
  const describedBy = [
    'credential-hint',
    'credential-help',
    !errorBelongsToPassword && error ? 'credential-error' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      persistSignInRedirect(signInReturnTo);
      await signInWithGoogle(signInReturnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError('');
    setAppleLoading(true);
    try {
      persistSignInRedirect(signInReturnTo);
      await signInWithApple(signInReturnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apple sign-in failed');
      setAppleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // A disabled button doesn't block Enter from the text input — guard against
    // a double-submit firing validatePasscode/signIn twice (burns a rate-limit
    // attempt). Also wait out `authLoading`: until auth restore resolves,
    // `user` is null even for a returning account, which would misroute a
    // passcode into the account-less anon-session branch and clobber the real
    // session.
    if (isLoading || submissionPendingRef.current || !canContinue) return;
    setError('');

    if (kind === 'passcode') {
      // Account-less passcode: commit to the branch, then collect the optional
      // name and the security check on the step that owns them. Neither may
      // sit beside the smart input, where five typed characters are still
      // ambiguous between a passcode and the start of an email — see
      // PasscodeDetailsForm.
      if (!user || user.is_anonymous === true) {
        turnstileRef.current?.reset();
        setCaptchaToken(null);
        setStep('passcode');
        return;
      }

      setLoading(true);
      submissionPendingRef.current = true;
      try {
        // Signed-in account: validate only (no anon session — Locked Decision
        // #8 keeps the account session untouched), then confirm before
        // expanding role (Phase 1c §2.2). DB access stays auth.uid()-based.
        const normalizedCredential = normalizeCredential(credential);
        const result = await validatePasscode(normalizedCredential);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setPending({
          showId: result.showId,
          showName: result.showName,
          role: result.role,
          passcode: normalizedCredential,
        });
      } finally {
        submissionPendingRef.current = false;
        setLoading(false);
      }
      return;
    }

    if (kind !== 'email') {
      // Defensive: `canContinue` already guarantees `kind` is 'email' or
      // 'passcode' here ('passcode' returned above), so this only narrows the
      // type — it is not reachable through the disabled/hidden controls.
      setError(passcodeOnly ? INVALID_PASSCODE_COPY : INVALID_COPY);
      return;
    }

    if (password === '') {
      setError(EMPTY_PASSWORD_COPY);
      document.getElementById('password')?.focus();
      return;
    }
    if (captchaRequired && !captchaToken) return;

    submissionPendingRef.current = true;
    setLoading(true);
    try {
      await signIn(
        normalizeCredential(credential),
        password,
        captchaRequired ? (captchaToken ?? undefined) : undefined
      );
      navigate(signInReturnTo);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      if (captchaRequired) turnstileRef.current?.reset();
      submissionPendingRef.current = false;
      setLoading(false);
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || submissionPendingRef.current) return;
    if (anonymousPasscodeNeedsCaptcha && !captchaToken) return;
    setError('');
    setLoading(true);
    submissionPendingRef.current = true;
    try {
      const normalizedCredential = normalizeCredential(credential);
      // Account-less: mint an anonymous session stamped with the ringside
      // claim (Phase C/D) so the DB admits this device's offline reads/writes,
      // then keep the UI role + presence identity in the client grant.
      let result;
      try {
        result =
          captchaRequired && !user
            ? await startAnonymousRingsideSession(normalizedCredential, {
                ...(captchaToken ? { captchaToken } : {}),
                requireCaptcha: true,
              })
            : await startAnonymousRingsideSession(normalizedCredential);
      } finally {
        if (captchaRequired) turnstileRef.current?.reset();
      }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const typedName = displayName.trim();
      // `setGrant` itself persists the confirmed claim to the offline-reload
      // fallback cache (ringsideGrantStore.ts) — the single choke point every
      // successful passcode entry passes through, this call included (MYK9-834).
      setGrant({
        showId: result.showId,
        role: result.role,
        passcode: normalizedCredential,
        ...(typedName ? { name: typedName } : {}),
        sessionId: crypto.randomUUID(),
        source: 'passcode',
      });
      navigate(`/at-show/${result.showId}`);
    } finally {
      submissionPendingRef.current = false;
      setLoading(false);
    }
  };

  const handleConfirmJoin = () => {
    if (!pending) return;
    setIsJoining(true);
    setGrant({
      showId: pending.showId,
      role: pending.role,
      passcode: pending.passcode,
      source: 'passcode',
    });
    navigate(`/at-show/${pending.showId}`);
  };

  const editCredential = () => {
    turnstileRef.current?.reset();
    setCaptchaToken(null);
    setStep('input');
    setPassword('');
    setError('');
  };

  // Two different insets, because the fixed chrome is not one thing.
  //
  // The HEADER is `fixed`, so it never pushes this page down: subtracting its
  // height from min-height leaves the centring region starting at y=0, and on a
  // short viewport the card centres UNDER the header (measured -8px at 653px).
  // Pad the top by the HEADER height so the region starts below it.
  //
  // The PWA install BANNER is different — it renders an in-flow spacer that has
  // already pushed this page down, and it moves the header down with it. So the
  // height to subtract is the BANNER's, not the combined --app-top-inset:
  // subtracting the combined value double-counts the header, and using
  // 100vh flat overflows by the banner's height whenever it shows.
  return (
    <div className="flex min-h-[calc(100vh-var(--pwa-banner-height,0px))] flex-col items-center justify-center bg-background px-3 pb-4 pt-[var(--app-header-height,3rem)]">
      <div className="bg-card p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="mb-3 flex justify-center">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded transition hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <img
              src="/brand-mark-128.png"
              alt=""
              aria-hidden="true"
              width="40"
              height="40"
              className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 object-contain"
            />
            <span className="text-base sm:text-lg font-bold text-primary">myK9Show</span>
          </Link>
        </div>
        <h2 className="mb-1 text-center text-base sm:text-lg font-bold">{heading}</h2>
        {!passcodeOnly && (
          <div className="text-muted-foreground mb-4 sm:mb-5 text-center text-sm">
            Don't have an account?{' '}
            <Link to={signUpPath} className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        )}

        {/* aria-live region announcing branch + step transitions. */}
        <div className="sr-only" aria-live="polite">
          {step === 'passcode'
            ? 'Show passcode entered. Add your name if you like, then continue.'
            : liveHint}
        </div>

        {step === 'passcode' ? (
          <>
            <LockedCredentialChip value={normalizeCredential(credential)} onEdit={editCredential} />
            <PasscodeDetailsForm
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              onSubmit={handlePasscodeSubmit}
              isLoading={isLoading}
              error={error}
              needsCaptcha={anonymousPasscodeNeedsCaptcha}
              turnstileSiteKey={turnstileSiteKey}
              turnstileRef={turnstileRef}
              onTokenChange={setCaptchaToken}
              submitDisabled={anonymousPasscodeNeedsCaptcha && !captchaToken}
            />
          </>
        ) : (
          <>
            {!passcodeOnly && (
              <>
                <SocialSignInButtons
                  onGoogle={handleGoogleSignIn}
                  onApple={handleAppleSignIn}
                  disabled={isLoading || googleLoading || appleLoading}
                />
                <div className="relative my-4 sm:my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-input" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              </>
            )}

            <SignInCredentialForm
              passcodeOnly={passcodeOnly}
              credential={credential}
              onCredentialChange={value => {
                setCredential(value);
                if (error) setError('');
              }}
              kind={kind}
              liveHint={liveHint}
              describedBy={describedBy}
              error={error}
              errorBelongsToPassword={errorBelongsToPassword}
              onSubmit={handleSubmit}
              canContinue={canContinue}
              isLoading={isLoading}
              showPasswordSection={showPasswordSection}
              showContinueButton={showContinueButton}
              password={password}
              onPasswordChange={setPassword}
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword(prev => !prev)}
              captchaRequired={captchaRequired}
              captchaToken={captchaToken}
              turnstileSiteKey={turnstileSiteKey}
              turnstileRef={turnstileRef}
              onTokenChange={setCaptchaToken}
            />
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
