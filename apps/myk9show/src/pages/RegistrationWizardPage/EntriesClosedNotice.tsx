import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface EntriesClosedNoticeProps {
  notYetOpen: boolean;
  reason: string | null | undefined;
  recoveryHref: string;
  exitLabel: string;
  onExit: () => void;
}

/** The wizard's body when the show is not taking entries: say why and offer the two ways out. */
export function EntriesClosedNotice({
  notYetOpen,
  reason,
  recoveryHref,
  exitLabel,
  onExit,
}: EntriesClosedNoticeProps) {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-muted/30 p-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {notYetOpen ? 'Entries not open yet' : 'Entries closed'}
      </p>
      <h3 className="mt-2 text-2xl font-semibold text-foreground">
        {notYetOpen
          ? 'This show is not accepting online entries yet.'
          : 'This show is no longer accepting normal online entries.'}
      </h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {reason ?? 'Contact the show team if you need help with a late entry or a change.'}
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild className="min-h-[44px]">
          <Link to={recoveryHref}>Message the show team</Link>
        </Button>
        <Button variant="outline" className="min-h-[44px]" onClick={onExit}>
          {exitLabel}
        </Button>
      </div>
    </div>
  );
}
