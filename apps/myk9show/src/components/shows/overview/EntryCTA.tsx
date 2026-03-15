import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { differenceInDays, differenceInHours, isBefore, isAfter } from 'date-fns';
import type { Show } from '@/types/show-types';

interface RegistrationState {
  canRegister: boolean;
  statusText: string;
  buttonLabel: string;
  isUrgent: boolean;
}

function computeRegistrationState(show: Show): RegistrationState {
  const now = new Date();
  const openDate = new Date(show.entryOpenDate);
  const closeDate = new Date(show.entryCloseDate);
  const entriesOpen = isAfter(now, openDate);
  const entriesNotClosed = isBefore(now, closeDate);
  const isAccepting =
    show.status?.toLowerCase() === 'accepting_entries' ||
    show.status?.toLowerCase() === 'published';

  if (!entriesOpen) {
    const daysUntilOpen = differenceInDays(openDate, now);
    return {
      canRegister: false,
      statusText:
        daysUntilOpen <= 1 ? 'Entries open tomorrow' : `Entries open in ${daysUntilOpen} days`,
      buttonLabel: 'Not Open Yet',
      isUrgent: false,
    };
  }

  if (!entriesNotClosed) {
    return {
      canRegister: false,
      statusText: 'Entries are closed',
      buttonLabel: 'Entries Closed',
      isUrgent: false,
    };
  }

  if (!isAccepting) {
    return {
      canRegister: false,
      statusText: 'Show is not accepting entries',
      buttonLabel: 'Not Available',
      isUrgent: false,
    };
  }

  // Entries are open — compute countdown
  const daysLeft = differenceInDays(closeDate, now);
  const hoursLeft = differenceInHours(closeDate, now);
  let statusText: string;
  let isUrgent = false;

  if (hoursLeft < 24) {
    statusText =
      hoursLeft <= 1 ? 'Entries close within the hour!' : `${hoursLeft} hours until entries close`;
    isUrgent = true;
  } else if (daysLeft <= 3) {
    statusText =
      daysLeft === 1 ? 'Entries close tomorrow!' : `${daysLeft} days until entries close`;
    isUrgent = true;
  } else {
    const closeFormatted = closeDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
    statusText = `Entries close ${closeFormatted}`;
  }

  return { canRegister: true, statusText, buttonLabel: 'Register Now', isUrgent };
}

interface EntryCTAProps {
  show: Show;
  onRegister: () => void;
}

export function EntryCTA({ show, onRegister }: EntryCTAProps) {
  // No useMemo — computation is cheap and uses new Date() internally,
  // which makes it impure. React Compiler handles memoization automatically.
  const state = computeRegistrationState(show);

  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-4 p-4',
        state.isUrgent && 'bg-amber-500/5 border-amber-500/20'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {state.isUrgent && <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />}
        <span
          className={cn(
            'text-sm font-medium',
            state.isUrgent ? 'text-amber-700' : 'text-muted-foreground'
          )}
        >
          {state.statusText}
        </span>
      </div>
      <Button
        onClick={onRegister}
        disabled={!state.canRegister}
        size="lg"
        className="flex-shrink-0"
      >
        {state.buttonLabel}
      </Button>
    </Card>
  );
}
