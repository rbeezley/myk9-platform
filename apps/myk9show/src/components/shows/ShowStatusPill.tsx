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
  /** Enables the publish gate: publishing requires the club's Stripe payouts. */
  clubId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-amber-950 border border-amber-800 text-amber-400',
  },
  published: {
    label: 'Published',
    className: 'bg-green-950 border border-green-800 text-green-400',
  },
  upcoming: {
    label: 'Upcoming',
    className: 'bg-blue-950 border border-blue-800 text-blue-400',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-orange-950 border border-orange-800 text-orange-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-muted border border-border text-muted-foreground',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-950 border border-red-900 text-red-400',
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
    // only fires on the draft → published transition).
    if (next === 'published' && clubId && !canEnableOnlineEntries(clubAccountQuery.data)) {
      toast.error(PUBLISH_BLOCKED_MESSAGE, {
        action: { label: 'Open Payments', onClick: () => navigate('/club-admin/payments') },
      });
      return;
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
