/**
 * One sentence per unresolved club-context status.
 *
 * MYK9-138. Split from ClubContextGate.tsx so the component file exports only a
 * component (react-refresh), and so this mapping — the actual subject of the
 * bug — can be asserted without rendering.
 *
 * The defect was a MISSING BRANCH: the old inline ternary named only
 * `ambiguous` and `missing`, and everything else inherited "check your
 * connection". `not-applicable` fell there, so an authorization gap was
 * reported as a network failure and the operator debugged the wrong thing.
 * A total switch over the union means a new status cannot be added silently.
 */

import { Building2, WifiOff, ShieldAlert, Loader2, type LucideIcon } from 'lucide-react';
import type { ValidatedClubContext } from '@/hooks/useValidatedClubContext';

/** The context shapes the gate handles — everything except `ready`. */
export type UnresolvedClubContext = Exclude<ValidatedClubContext, { status: 'ready' }>;

/** Statuses that render a sentence rather than a club switcher. */
export type MessagedClubContext = Exclude<UnresolvedClubContext, { status: 'choose' }>;

export interface ClubContextMessage {
  icon: LucideIcon;
  message: string;
  /** Retrying only helps when the failure could actually be transient. */
  canRetry: boolean;
}

export function describeClubContext(
  context: MessagedClubContext,
  surface: string
): ClubContextMessage {
  switch (context.status) {
    case 'not-applicable':
      // Authorization, never connectivity. This is the branch that was missing.
      return {
        icon: ShieldAlert,
        message: `You need club administrator access to manage ${surface}.`,
        canRetry: false,
      };
    case 'loading':
      return { icon: Loader2, message: 'Checking your club access…', canRetry: true };
    case 'unavailable':
      return {
        icon: WifiOff,
        message: 'We could not load your clubs. Check your connection and try again.',
        canRetry: true,
      };
    case 'missing':
      return context.scopeIds.length === 0
        ? {
            icon: Building2,
            message: `There are no clubs set up yet, so there are no ${surface} to manage.`,
            canRetry: false,
          }
        : {
            icon: ShieldAlert,
            message: `Your club access needs to be configured before you can manage ${surface}.`,
            canRetry: false,
          };
  }
}
