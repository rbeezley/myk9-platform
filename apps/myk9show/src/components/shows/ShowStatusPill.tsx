import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateShowMutation } from '@/hooks/queries/useShowsDatabase';
import {
  useClubStripeAccount,
  useClubAuthorization,
} from '@/features/payments/useClubStripeAccount';
import {
  becomesPublic,
  canEnableOnlineEntries,
  isPublishGateDbError,
  publishNeedsStripe,
  publishGateDbErrorMessage,
  PUBLISH_BLOCKED_MESSAGE,
  CLUB_UNAUTHORIZED_MESSAGE,
  CLUB_REQUIRED_MESSAGE,
  PUBLISH_GATE_ERRCODE_UNAUTHORIZED,
  PUBLISH_GATE_ERRCODE_ENTRY_WINDOW,
  entryWindowPublishError,
} from '@/features/payments/onlineEntryGate';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
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
  /** MYK9-716: publishing requires an entry window (a draft may have none).
   * Required keys, so a caller cannot forget them and publish past the gate;
   * a null or empty value fails closed. */
  entryOpenDate: string | null | undefined;
  entryCloseDate: string | null | undefined;
  /** MYK9-979: publishing needs the club's Stripe payouts only when the show
   * takes online entries. Required, so a caller cannot drop it; anything but
   * an explicit true reads as off, matching the server (the trigger refuses a
   * show whose stored value is true either way). */
  onlineEntriesEnabled: boolean | null | undefined;
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
  entryOpenDate,
  entryCloseDate,
  onlineEntriesEnabled,
}: ShowStatusPillProps) {
  const { mutateAsync, isPending } = useUpdateShowMutation();
  const navigate = useNavigate();
  const clubAccountQuery = useClubStripeAccount(clubId);
  const clubAuthQuery = useClubAuthorization(clubId);
  const config = pillConfig(status);
  const transitions = TRANSITIONS[status] ?? [];
  // The entry dates live on the Edit panel's Basic Info tab.
  const setEntryWindowAction = {
    label: 'Set entry window',
    onClick: () => navigate(getShowEditHref(showId)),
  };

  async function handleTransition(next: string) {
    // Publishing opens online entries; fail closed unless the club's Stripe
    // payouts are enabled. Already-published shows are unaffected (the gate
    // only fires on a transition INTO 'published' from a different status —
    // this pill can publish only from draft, upcoming, or in_progress, per
    // MYK9-579 round 6). This is a UX convenience, not the enforcement
    // boundary: enforce_show_publish_gate()
    // (supabase/migrations/20260916003500) is the DB-side backstop that
    // actually refuses the write on both INSERT and UPDATE OF status — see
    // the catch block below.
    // MYK9-979: the gate runs on any move that makes the show publicly
    // visible (becomesPublic), the same transition the DB triggers check.
    if (becomesPublic(status, next)) {
      if (!clubId) {
        // Fail CLOSED, not open: a missing clubId is either a wiring bug
        // (lost in the #615 merge once already) or a genuinely clubless show
        // — and the payout cron cannot pay out a show with no club, so its
        // entry fees would collect with nowhere to go.
        toast.error(CLUB_REQUIRED_MESSAGE);
        return;
      }
      const needsStripe = publishNeedsStripe(onlineEntriesEnabled);
      if (clubAuthQuery.isLoading || (needsStripe && clubAccountQuery.isLoading)) {
        // Don't misreport an onboarded club as unconnected on a cold cache.
        toast.info('Checking the club’s status — try again in a moment.');
        return;
      }
      if (clubAuthQuery.isError || (needsStripe && clubAccountQuery.isError)) {
        // A failed lookup is not "not connected" — fail closed with the
        // truthful message instead of blaming the club's setup. Kick off a
        // refetch so "try again" can actually succeed (an errored query
        // inside staleTime would otherwise serve the same error forever).
        void clubAccountQuery.refetch();
        void clubAuthQuery.refetch();
        toast.error('Could not check the club’s status. Please try again.');
        return;
      }
      // MYK9-572: authorization is checked before Stripe readiness, same
      // order as the DB trigger (enforce_show_publish_gate). Fail CLOSED —
      // treat an unreadable/undefined club row the same as an explicitly
      // unauthorized one, don't rely solely on the isError branch above to
      // have already caught it.
      if (clubAuthQuery.data == null || clubAuthQuery.data.authorized_at === null) {
        // Kick off a refetch so a retry right after a site admin authorizes
        // the club can actually succeed within the query's staleTime window,
        // mirroring the isError branch above.
        void clubAuthQuery.refetch();
        toast.error(CLUB_UNAUTHORIZED_MESSAGE);
        return;
      }
      // MYK9-979: a mail-in show (online entries off) needs no payout account.
      if (needsStripe && !canEnableOnlineEntries(clubAccountQuery.data)) {
        toast.error(PUBLISH_BLOCKED_MESSAGE, {
          action: { label: 'Open Payments', onClick: () => navigate('/club-admin/payments') },
        });
        return;
      }
      // MYK9-716: checked last, the same order as enforce_show_publish_gate.
      const windowError = entryWindowPublishError(entryOpenDate, entryCloseDate);
      if (windowError) {
        toast.error(windowError, { action: setEntryWindowAction });
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
        const message = publishGateDbErrorMessage(error) ?? PUBLISH_BLOCKED_MESSAGE;
        const code = (error as { code?: string }).code;
        if (code === PUBLISH_GATE_ERRCODE_ENTRY_WINDOW) {
          toast.error(message, { action: setEntryWindowAction });
          return;
        }
        // "Open Payments" only makes sense for the Stripe-readiness refusal.
        // The missing-club refusal shares MK003 but needs "assign a club",
        // not a trip to the payments page; MK004 (club not authorized) has
        // no Stripe setup to send the admin to either — both would be dead
        // ends.
        if (message === CLUB_REQUIRED_MESSAGE || code === PUBLISH_GATE_ERRCODE_UNAUTHORIZED) {
          toast.error(message);
        } else {
          toast.error(message, {
            action: { label: 'Open Payments', onClick: () => navigate('/club-admin/payments') },
          });
        }
        return;
      }
      toast.error('Failed to update show status. Please try again.');
    }
  }

  const pill = (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
      {transitions.length > 0 && <ChevronDown className="h-3 w-3 opacity-70" />}
    </span>
  );

  if (transitions.length === 0) {
    return pill;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isPending}>
        <button aria-label={config.label}>{pill}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.map(({ label, next }) => (
          <DropdownMenuItem key={next} onClick={() => handleTransition(next)}>
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
