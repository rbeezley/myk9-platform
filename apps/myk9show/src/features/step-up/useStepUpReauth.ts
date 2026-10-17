/**
 * MYK9-1208: the state behind one "Confirm your password to continue" prompt.
 *
 * Password first for accounts that have one; an emailed code for Google or Apple accounts
 * (and anyone who would rather not type a password). Success hands the new access token
 * to `settleStepUp`, which replays the refused request; Cancel answers null and the
 * caller shows its usual refusal.
 */
import { useState } from 'react';
import { StepUpError, confirmWithCode, confirmWithPassword, sendStepUpCode } from './stepUpAuth';
import { settleStepUp, type StepUpAccount } from './stepUpStore';

export type StepUpMode = 'password' | 'code';

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

export function useStepUpReauth(account: StepUpAccount) {
  const [mode, setMode] = useState<StepUpMode>(account.hasPassword ? 'password' : 'code');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof StepUpError ? err.message : FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return {
    mode,
    codeSent,
    busy,
    error,
    switchMode: (next: StepUpMode) => {
      setMode(next);
      setError(null);
    },
    submitPassword: (password: string) =>
      run(async () => settleStepUp(await confirmWithPassword(account, password))),
    sendCode: () =>
      run(async () => {
        await sendStepUpCode(account);
        setCodeSent(true);
      }),
    submitCode: (code: string) =>
      run(async () => settleStepUp(await confirmWithCode(account, code))),
    cancel: () => settleStepUp(null),
  };
}
