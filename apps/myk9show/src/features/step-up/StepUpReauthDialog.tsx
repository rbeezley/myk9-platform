/**
 * MYK9-1208: "Confirm your password to continue". Mounted once at the app root; it opens
 * only when the server refuses a refund or a role change for want of a recent sign-in
 * (see stepUpFetch.ts), and one confirmation covers the next five minutes.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/security/TurnstileChallenge';
import { supabase } from '@/services/database/supabaseClient';
import { loadFreshStepUpToken, loadStepUpAccount } from './stepUpAuth';
import { isFreshlyReauthenticated } from './stepUpToken';
import {
  registerStepUpHost,
  settleStepUp,
  useStepUpStore,
  type StepUpAccount,
} from './stepUpStore';
import { useStepUpReauth } from './useStepUpReauth';

export function StepUpReauthHost() {
  const account = useStepUpStore(state => state.account);
  const promptId = useStepUpStore(state => state.promptId);

  useEffect(() => registerStepUpHost(loadStepUpAccount, loadFreshStepUpToken), []);

  return (
    <Dialog
      open={account !== null}
      onOpenChange={open => {
        if (!open) settleStepUp(null);
      }}
    >
      {account && <StepUpReauthForm key={promptId} account={account} />}
    </Dialog>
  );
}

function StepUpReauthForm({ account }: { account: StepUpAccount }) {
  // Owned here, as on the sign-in page; the hook only resets it after each attempt.
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);
  const step = useStepUpReauth(account, turnstileRef);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // The emailed link can be followed in another tab: that tab signs in again and auth-js
  // broadcasts the new session here. A fresh session for this account answers the prompt,
  // so the request replays and the code is not needed.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') return;
      if (!session || session.user.id !== account.userId) return;
      if (isFreshlyReauthenticated(session.access_token)) settleStepUp(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, [account.userId]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step.mode === 'password') void step.submitPassword(password);
    else if (step.codeSent) void step.submitCode(code);
    else void step.sendCode();
  };

  const usingPassword = step.mode === 'password';
  const submitLabel = usingPassword
    ? 'Confirm'
    : step.codeSent
      ? 'Confirm code'
      : 'Email me a code';
  const submitDisabled =
    step.busy ||
    !step.captcha.ready ||
    (usingPassword && password.length === 0) ||
    (!usingPassword && step.codeSent && code.trim().length === 0);

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={onSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>
            {usingPassword ? 'Confirm your password to continue' : 'Confirm it is you'}
          </DialogTitle>
          <DialogDescription>
            {usingPassword
              ? 'This change moves money or access, so we check it is still you. One confirmation covers the next five minutes.'
              : step.codeSent
                ? `We emailed a sign-in code to ${account.email}. Enter it below, or open the link in that email.`
                : `We will email a sign-in code to ${account.email}. One confirmation covers the next five minutes.`}
          </DialogDescription>
        </DialogHeader>

        {usingPassword ? (
          <div className="space-y-1">
            <Label htmlFor="step-up-password">Password</Label>
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>
        ) : (
          step.codeSent && (
            <div className="space-y-1">
              <Label htmlFor="step-up-code">Code from the email</Label>
              <Input
                id="step-up-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={event => setCode(event.target.value)}
              />
            </div>
          )
        )}

        {step.captcha.required && (
          <TurnstileChallenge
            ref={turnstileRef}
            siteKey={step.captcha.siteKey}
            action="step_up"
            onTokenChange={step.captcha.onTokenChange}
          />
        )}

        {step.error && (
          <p role="alert" className="text-sm text-destructive">
            {step.error}
          </p>
        )}

        <div className="text-sm">
          {usingPassword ? (
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center px-1 text-primary underline-offset-4 hover:underline"
              onClick={() => step.switchMode('code')}
            >
              Email me a code instead
            </button>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {step.codeSent && (
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center px-1 text-primary underline-offset-4 hover:underline"
                  disabled={step.busy || !step.captcha.ready}
                  onClick={() => void step.sendCode()}
                >
                  Send a new code
                </button>
              )}
              {account.hasPassword && (
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center px-1 text-primary underline-offset-4 hover:underline"
                  onClick={() => step.switchMode('password')}
                >
                  Use my password instead
                </button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={step.cancel} disabled={step.busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {step.busy ? 'Checking…' : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
