/**
 * MYK9-1208: the state behind one "Confirm your password to continue" prompt.
 *
 * Password first for accounts that have one; an emailed code for Google or Apple accounts
 * (and anyone who would rather not type a password). Success hands the new access token
 * to `settleStepUp`, which replays the refused request; Cancel answers null and the
 * caller shows its usual refusal.
 */
import { useState, type RefObject } from 'react';
import type { TurnstileChallengeHandle } from '@/components/security/TurnstileChallenge';
import { getTurnstileSiteKey } from '@/config/turnstile';
import { StepUpError, confirmWithCode, confirmWithPassword, sendStepUpCode } from './stepUpAuth';
import { settleStepUp, type StepUpAccount } from './stepUpStore';

export type StepUpMode = 'password' | 'code';

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

export function useStepUpReauth(
  account: StepUpAccount,
  turnstileRef: RefObject<TurnstileChallengeHandle | null>
) {
  const [mode, setMode] = useState<StepUpMode>(account.hasPassword ? 'password' : 'code');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CAPTCHA exactly as on the sign-in page: on only when a Turnstile key is configured,
  // a fresh token per attempt (Turnstile tokens are single use), reset after each try.
  const captchaSiteKey = getTurnstileSiteKey();
  const captchaRequired = captchaSiteKey.length > 0;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const run = async (action: (token: string | undefined) => Promise<void>) => {
    if (busy || (captchaRequired && !captchaToken)) return;
    setBusy(true);
    setError(null);
    try {
      await action(captchaRequired ? (captchaToken ?? undefined) : undefined);
    } catch (err) {
      setError(err instanceof StepUpError ? err.message : FALLBACK_ERROR);
    } finally {
      if (captchaRequired) turnstileRef.current?.reset();
      setBusy(false);
    }
  };

  return {
    mode,
    codeSent,
    busy,
    error,
    captcha: {
      required: captchaRequired,
      siteKey: captchaSiteKey,
      ready: !captchaRequired || captchaToken !== null,
      onTokenChange: setCaptchaToken,
    },
    switchMode: (next: StepUpMode) => {
      setMode(next);
      setError(null);
    },
    submitPassword: (password: string) =>
      run(async token => settleStepUp(await confirmWithPassword(account, password, token))),
    sendCode: () =>
      run(async token => {
        await sendStepUpCode(account, token);
        setCodeSent(true);
      }),
    submitCode: (code: string) =>
      run(async token => settleStepUp(await confirmWithCode(account, code, token))),
    cancel: () => settleStepUp(null),
  };
}
