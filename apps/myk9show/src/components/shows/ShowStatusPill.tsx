import { Fragment } from 'react';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import {
  showPublishBlockersQueryKey,
  usePublishBlockers,
} from '@/features/publishing/usePublishBlockers';
import {
  CLUB_PAYMENTS_LINK_LABEL,
  clubPaymentsHref,
  useCanOpenClubPayments,
} from '@/features/payments/useCanOpenClubPayments';
import {
  becomesPublic,
  isPublishGateDbError,
  isPayoutsRefusalMessage,
  publishGateDbErrorMessage,
  CLUB_REQUIRED_MESSAGE,
  PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
} from '@/features/payments/onlineEntryGate';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import { SHOW_ADMIN_COPY } from '@/components/shows/showAdminErrorCopy';
import {
  SHOW_STATUS_VALUES,
  getStatusDescriptor,
  getStatusSurfaceClasses,
} from '@/components/status';

interface ShowStatusPillProps {
  showId: string;
  status: string;
  /** Publishing requires the club's Stripe payouts. Omitting this does NOT
   * skip the gate — publish fails closed without a club. */
  clubId?: string;
  /** MYK9-2198: opens the "Before you can publish" list (the About tab) when something blocks. */
  onSeeBlockers?: () => void;
  /** Render the status as plain text in a sentence (the header's status line, MYK9-1282) instead
   * of a coloured pill. The status-change menu is the same either way. */
  plain?: boolean;
}

/**
 * The pill's label and colour come from the shared status grammar's `show` family (MYK9-929, M5),
 * so a show reads the same here as in the table. An unrecognised status shows its raw text, muted.
 */
function pillConfig(status: string): { label: string; className: string } {
  if (!(SHOW_STATUS_VALUES as readonly string[]).includes(status)) {
    return {
      label: status,
      className: 'bg-muted border border-border text-muted-foreground',
    };
  }
  return {
    label: getStatusDescriptor('show', status).label,
    className: `${getStatusSurfaceClasses('show', status)} border border-border`,
  };
}

const TRANSITIONS: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: 'Publish Show', next: 'published' }],
  published: [{ label: 'Move to Draft', next: 'draft' }],
  upcoming: [{ label: 'Publish Show', next: 'published' }],
  in_progress: [{ label: 'Publish Show', next: 'published' }],
  completed: [],
  cancelled: [],
};

export function ShowStatusPill({
  showId,
  status,
  clubId,
  onSeeBlockers,
  plain = false,
}: ShowStatusPillProps) {
  const { mutateAsync, isPending } = useUpdateShowMutation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transitions = TRANSITIONS[status] ?? [];
  // MYK9-2198: the server's list of what blocks publishing is the one answer. It is read only
  // while this pill offers a publish, and is empty for a show that is already public.
  const canPublish = transitions.some(({ next }) => becomesPublic(status, next));
  const online = useIsOnline();
  // Asked only for a draft: a show that is already public has no list.
  const blockers = usePublishBlockers(showId, canPublish && status === 'draft');
  const config = pillConfig(status);
  // The entry dates live on the Edit panel's Basic Info tab.
  const setEntryWindowAction = {
    label: 'Set entry window',
    onClick: () => navigate(getShowEditHref(showId)),
  };

  // Only someone who can open the club's Payments tab is sent there; others read the reason.
  const canOpenPayments = useCanOpenClubPayments(clubId);
  const paymentsOptions = canOpenPayments
    ? {
        action: {
          label: CLUB_PAYMENTS_LINK_LABEL,
          onClick: () => navigate(clubId ? clubPaymentsHref(clubId) : '/clubs'),
        },
      }
    : undefined;

  async function handleTransition(next: string) {
    // Already-published shows are unaffected (the gate only fires on a transition INTO
    // 'published' from a different status; this pill can publish only from draft, upcoming, or
    // in_progress, per MYK9-579 round 6). Nothing here predicts the gate: the show's "Before you
    // can publish" list (MYK9-2198, from the server) shows what blocks, and
    // enforce_show_publish_gate() decides, with its refusal text shown in the catch block.
    // MYK9-979: the gate runs on any move that makes the show publicly
    // visible (becomesPublic), the same transition the DB triggers check.
    if (becomesPublic(status, next)) {
      if (!online) {
        toast.error('Reconnect to publish.');
        return;
      }
      if (!clubId) {
        // Fail CLOSED, not open: a missing clubId is either a wiring bug
        // (lost in the #615 merge once already) or a genuinely clubless show
        // — and the payout cron cannot pay out a show with no club, so its
        // entry fees would collect with nowhere to go.
        toast.error(CLUB_REQUIRED_MESSAGE);
        return;
      }
      // Something blocks: show the list instead of attempting a publish that will be refused.
      // A list that failed while online falls through to the attempt, whose refusal
      // text is the backstop.
      if (blockers.state === 'ready' && blockers.blockers.length > 0 && onSeeBlockers) {
        onSeeBlockers();
        return;
      }
    }

    try {
      await mutateAsync({ id: showId, updates: { status: next } });
      toast.success(`Show ${next === 'published' ? 'published' : 'moved to draft'}.`);
    } catch (error) {
      // Backstop: the client-side checks above already cover the common
      // case, but a stale cache or a race can still reach the DB trigger
      // (enforce_show_publish_gate, MYK9-579). Its refusal text IS the
      // friendly copy, so surface it instead of the generic fallback.
      if (isPublishGateDbError(error)) {
        const message = publishGateDbErrorMessage(error) ?? SHOW_ADMIN_COPY.statusChangeFailed;
        const code = (error as { code?: string }).code;
        if (code === PUBLISH_GATE_ERRCODE_ENTRY_WINDOW) {
          toast.error(message, { action: setEntryWindowAction });
          return;
        }
        // The payments link only makes sense for the payouts refusal. The missing-club
        // refusal shares MK003 but needs "assign a club", not a trip to the payments page;
        // MK004 (club not authorized) has no Stripe setup to send the admin to either.
        if (message === CLUB_REQUIRED_MESSAGE || code === PUBLISH_GATE_ERRCODE_UNAUTHORIZED) {
          toast.error(message);
        } else {
          if (isPayoutsRefusalMessage(message)) {
            toast.error(message, paymentsOptions);
          } else {
            // Another refusal (for example "a published show always takes online entries").
            toast.error(message);
          }
        }
        return;
      }
      toast.error(SHOW_ADMIN_COPY.statusChangeFailed);
    }
  }

  const pill = (
    <span
      className={
        plain
          ? 'inline-flex items-center gap-1 font-medium text-foreground'
          : `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${config.className}`
      }
    >
      {config.label}
      {transitions.length > 0 && <ChevronDown className="h-3 w-3 opacity-70" />}
    </span>
  );

  if (transitions.length === 0) {
    return pill;
  }

  return (
    <DropdownMenu
      // The list may have changed since it was last read (a premium published, dates edited);
      // opening the menu asks the server again.
      onOpenChange={open => {
        if (open && canPublish) {
          void queryClient.invalidateQueries({ queryKey: showPublishBlockersQueryKey(showId) });
        }
      }}
    >
      <DropdownMenuTrigger asChild disabled={isPending}>
        <button
          aria-label={config.label}
          // Plain, in a line of small text: the pseudo-element stretches the target to 44px
          // (docs/INTENT.md) without taking any layout space.
          className={
            plain
              ? "relative before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
              : undefined
          }
        >
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.map(({ label, next }) => {
          const publishes = becomesPublic(status, next);
          if (publishes && !online) {
            // A publish started offline would wait in the mutation queue and go out on reconnect,
            // after the secretary stopped looking. Not offered.
            return (
              <DropdownMenuItem key={next} disabled>
                Reconnect to publish.
              </DropdownMenuItem>
            );
          }
          if (publishes && blockers.state === 'checking') {
            // The list is still being read: do not offer a publish that may be refused.
            return (
              <DropdownMenuItem key={next} disabled>
                Checking what blocks publishing…
              </DropdownMenuItem>
            );
          }
          const blocked = publishes && blockers.state === 'ready' && blockers.blockers.length > 0;
          return (
            <Fragment key={next}>
              <DropdownMenuItem onClick={() => handleTransition(next)}>
                {blocked ? 'See what blocks publishing' : label}
              </DropdownMenuItem>
              {publishes && blockers.state === 'failed' && (
                <p className="max-w-64 px-2 pb-2 text-sm text-muted-foreground">
                  Could not check what blocks publishing. myK9Show will tell you if it refuses.
                </p>
              )}
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
