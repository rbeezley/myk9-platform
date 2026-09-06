import React from 'react';
import { AppleIcon } from '@/components/icons/AppleIcon';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

/**
 * SocialSignInButtons — the Google/Apple pair on the smart sign-in front door.
 *
 * INTENT: the two providers sit SIDE BY SIDE on one 44px row, not stacked.
 * Stacked they cost ~150px (two rows plus the divider), which pushed the
 * credential field below the fold on a laptop viewport — the whole point of
 * the one-screen layout is that the field you type into is always visible.
 * Labels are the bare provider names for the same reason: "Continue with
 * Google" does not fit a half-width button at this type scale.
 */
export interface SocialSignInButtonsProps {
  onGoogle: () => void;
  onApple: () => void;
  disabled: boolean;
}

const buttonClass =
  'flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export const SocialSignInButtons: React.FC<SocialSignInButtonsProps> = ({
  onGoogle,
  onApple,
  disabled,
}) => (
  <div className="flex gap-3">
    <button
      type="button"
      onClick={onGoogle}
      disabled={disabled}
      className={buttonClass}
      aria-label="Continue with Google"
    >
      <GoogleIcon className="h-5 w-5" />
      Google
    </button>
    <button
      type="button"
      onClick={onApple}
      disabled={disabled}
      className={buttonClass}
      aria-label="Continue with Apple"
    >
      <AppleIcon className="h-5 w-5" />
      Apple
    </button>
  </div>
);
