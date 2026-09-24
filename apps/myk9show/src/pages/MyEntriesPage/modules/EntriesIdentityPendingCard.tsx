/**
 * Shown when My Shows does not yet know which person it is loading entries
 * for — the state that used to render the first-run welcome by mistake.
 *
 * INTENT: this card claims NOTHING about whether the exhibitor has entries.
 * It reads as "still getting ready", never as "you have none" and never as an
 * error, because both of those would be assertions the page cannot support.
 * PRODUCT.md: "offline is normal, not broken" — poor connectivity must never
 * be presented as user failure. Online this state lasts a moment; offline it
 * persists until the connection returns, and resolves itself when it does.
 *
 * @module MyEntriesPage/modules/EntriesIdentityPendingCard
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EntriesIdentityState } from './entriesIdentityState';

interface EntriesIdentityPendingCardProps {
  /** Re-runs the entries load. Useful once a connection is back. */
  onRetry: () => void;
  refreshing: boolean;
  identityState: Exclude<EntriesIdentityState, 'resolved'>;
}

export const EntriesIdentityPendingCard: React.FC<EntriesIdentityPendingCardProps> = ({
  onRetry,
  refreshing,
  identityState,
}) => (
  <div
    className="rounded-2xl border border-border bg-card p-6 sm:p-8"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">
        {identityState === 'missing'
          ? 'We could not find your exhibitor profile'
          : 'Getting your shows ready'}
      </h2>
      <p className="max-w-[65ch] text-base text-muted-foreground">
        {identityState === 'missing'
          ? 'Your account is signed in, but it does not have an exhibitor profile yet. Check again after your profile is added, or contact your show secretary.'
          : 'We are still confirming your account. Anything you have already entered is saved and will appear here as soon as that finishes.'}
      </p>
      <div>
        {identityState === 'missing' ? (
          <p className="text-sm text-muted-foreground">
            Ask your show secretary to add the exhibitor profile to this account.
          </p>
        ) : (
          <Button
            variant="outline"
            onClick={onRetry}
            disabled={refreshing}
            className="min-h-[44px] transition-all duration-state"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking…' : 'Check again'}
          </Button>
        )}
      </div>
    </div>
  </div>
);
