/** The end-of-day card at the top of the class list (MYK9-2013). Logic lives in `ringDayDone.ts`. */
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useUnsentWorkState } from '@/hooks/useUnsentWork';
import { cn } from '@/lib/utils';
import { ringDayDone } from './ringDayDone';
import type { DatedRingClass } from './orderRingClassesByDay';
import { scoresNotSentHref } from './scoresNotSent/scoresNotSentPath';

export function RingDayDoneCard({
  showId,
  yourRing,
}: {
  showId: string | undefined;
  yourRing: readonly DatedRingClass[];
}) {
  const unsent = useUnsentWorkState();
  const done = ringDayDone(yourRing, unsent);
  if (!done) return null;
  const href =
    done.kind === 'unsent' ? scoresNotSentHref(showId, done.unsentScoreCount) : undefined;
  const Icon =
    done.kind === 'sent' ? CheckCircle2 : done.kind === 'checking' ? Loader2 : AlertCircle;

  return (
    <section
      role="status"
      aria-label="Your day"
      data-testid="ring-day-done"
      className={cn(
        'mb-3 flex flex-wrap items-center gap-3 rounded-xl border p-3',
        done.kind === 'sent' && 'border-success/30 bg-success/10 text-success',
        (done.kind === 'unsent' || done.kind === 'unchecked') &&
          'border-warning/30 bg-warning/10 text-warning',
        done.kind === 'checking' && 'border-border bg-muted text-foreground'
      )}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0', done.kind === 'checking' && 'animate-spin')}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-base font-medium">{done.text}</p>
      {href && (
        <Link
          to={href}
          className="inline-flex min-h-11 items-center rounded-md px-3 font-medium underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Scores not sent
        </Link>
      )}
    </section>
  );
}
