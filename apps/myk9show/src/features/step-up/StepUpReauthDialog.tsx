/**
 * MYK9-1208: "Confirm your password to continue". Mounted once at the app root; it opens
 * only when the server refuses a refund or a role change for want of a recent sign-in
 * (see stepUpFetch.ts), and one confirmation covers the next five minutes.
 */
import { useEffect, useState, type FormEvent } from 'react';
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
import { loadStepUpAccount } from './stepUpAuth';
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

  useEffect(() => registerStepUpHost(loadStepUpAccount), []);

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
  const step = useStepUpReauth(account);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

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

        {step.error && (
          <p role="alert" className="text-sm text-destructive">
            {step.error}
          </p>
        )}

        <div className="text-sm">
          {usingPassword ? (
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => step.switchMode('code')}
            >
              Email me a code instead
            </button>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {step.codeSent && (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  disabled={step.busy}
                  onClick={() => void step.sendCode()}
                >
                  Send a new code
                </button>
              )}
              {account.hasPassword && (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
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
