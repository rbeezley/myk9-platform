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
import { useClubStripeAccount } from '@/features/payments/useClubStripeAccount';
import {
  canEnableOnlineEntries,
  PUBLISH_BLOCKED_MESSAGE,
} from '@/features/payments/onlineEntryGate';

interface ShowStatusPillProps {
  showId: string;
  status: string;
  /** Publishing requires the club's Stripe payouts. Omitting this does NOT
   * skip the gate — publish fails closed without a club. */
  clubId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-warning/10 border border-warning/30 text-warning ',
  },
  published: {
    label: 'Published',
    className:
      'bg-green-100 border border-green-300 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-400',
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-info/10 border border-info/30 text-info ',
  },
  in_progress: {
    label: 'In Progress',
    className:
      'bg-orange-100 border border-orange-300 text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-muted border border-border text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-destructive/10 border border-destructive/30 text-destructive ',
  },
};

const TRANSITIONS: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: 'Publish Show', next: 'published' }],
  published: [{ label: 'Move to Draft', next: 'draft' }],
};

export function ShowStatusPill({ showId, status, clubId }: ShowStatusPillProps) {
  const { mutateAsync, isPending } = useUpdateShowMutation();
  const navigate = useNavigate();
  const clubAccountQuery = useClubStripeAccount(clubId);
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: 'bg-muted border border-border text-muted-foreground',
  };
  const transitions = TRANSITIONS[status] ?? [];

  async function handleTransition(next: string) {
    // Publishing opens online entries; fail closed unless the club's Stripe
    // payouts are enabled. Already-published shows are unaffected (the gate
    // only fires on the draft → published transition). NOTE: this is a UI
    // guard — the DB does not enforce it; a bypass merely parks the payout
    // as 'pending' until the club connects (accepted for v1).
    if (next === 'published') {
      if (!clubId) {
        // Fail CLOSED, not open: a missing clubId is either a wiring bug
        // (lost in the #615 merge once already) or a genuinely clubless show
        // — and the payout cron cannot pay out a show with no club, so its
        // entry fees would collect with nowhere to go.
        toast.error(
          'Assign a club to this show before publishing — entry fees are paid out to the club.'
        );
        return;
      }
      if (clubAccountQuery.isLoading) {
        // Don't misreport an onboarded club as unconnected on a cold cache.
        toast.info('Checking the club’s payment account — try again in a moment.');
        return;
      }
      if (clubAccountQuery.isError) {
        // A failed lookup is not "not connected" — fail closed with the
        // truthful message instead of blaming the club's setup. Kick off a
        // refetch so "try again" can actually succeed (an errored query
        // inside staleTime would otherwise serve the same error forever).
        void clubAccountQuery.refetch();
        toast.error('Could not check the club’s payment account. Please try again.');
        return;
      }
      if (!canEnableOnlineEntries(clubAccountQuery.data)) {
        toast.error(PUBLISH_BLOCKED_MESSAGE, {
          action: { label: 'Open Payments', onClick: () => navigate('/club-admin/payments') },
        });
        return;
      }
    }

    try {
      await mutateAsync({ id: showId, updates: { status: next } });
      toast.success(`Show ${next === 'published' ? 'published' : 'moved to draft'}.`);
    } catch {
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
