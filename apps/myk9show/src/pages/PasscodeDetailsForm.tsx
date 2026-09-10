import React from 'react';
import {
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from '@/components/security/TurnstileChallenge';

interface PasscodeDetailsFormProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  error: string;
  needsCaptcha: boolean;
  turnstileSiteKey: string;
  turnstileRef: React.Ref<TurnstileChallengeHandle>;
  onTokenChange: (token: string | null) => void;
  submitDisabled: boolean;
}

/**
 * Step 2 of the account-less passcode branch: the optional name and, where
 * Turnstile is configured, the security check.
 *
 * Both live here rather than beside the smart input because the front door
 * cannot know whether five typed characters are a passcode or the first five
 * characters of an email ("secre" is both). Classifying every keystroke handed
 * this branch's UI to people typing an email — inserting a field under their
 * cursor and mounting a third-party iframe, then removing both on the next key.
 * Committing on Continue means the branch is only ever shown to someone who
 * asked for it.
 *
 * INTENT: the name is never required and never gates Continue — it exists so
 * show presence reads "Judge Sarah" instead of a bare role.
 */
export const PasscodeDetailsForm: React.FC<PasscodeDetailsFormProps> = ({
  displayName,
  onDisplayNameChange,
  onSubmit,
  isLoading,
  error,
  needsCaptcha,
  turnstileSiteKey,
  turnstileRef,
  onTokenChange,
  submitDisabled,
}) => (
  <form onSubmit={onSubmit}>
    <div className="mb-3">
      <label className="block mb-1 font-medium" htmlFor="display-name">
        Your name <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <input
        type="text"
        id="display-name"
        data-testid="display-name-input"
        autoComplete="name"
        autoCapitalize="words"
        placeholder="e.g. Judge Sarah"
        value={displayName}
        onChange={e => onDisplayNameChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background p-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <p className="mt-1 text-sm text-muted-foreground">
        Shown to others at the show so they know who&apos;s at each ring.
      </p>
    </div>

    {error && (
      <div id="passcode-error" className="text-destructive mb-4 text-center">
        {error}
      </div>
    )}

    {needsCaptcha && (
      <TurnstileChallenge
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
        action="ringside_login"
        onTokenChange={onTokenChange}
      />
    )}

    <button
      type="submit"
      data-testid="passcode-continue-button"
      disabled={submitDisabled || isLoading}
      aria-disabled={submitDisabled || isLoading}
      className="h-11 w-full rounded-md bg-primary px-4 text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? 'Joining…' : 'Continue'}
    </button>
  </form>
);
