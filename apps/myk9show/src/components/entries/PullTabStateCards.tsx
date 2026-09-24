import type { ReactNode } from 'react';
import { AlertCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The non-list states of the Pull Management tab.
 *
 * Kept together so the distinction they exist to draw is visible in one place:
 * "we could not read this" and "there is nothing here" are different claims,
 * and the tab used to render the error banner and the "none exist" card at the
 * same time.
 */

interface StateCardProps {
  icon: ReactNode;
  title: string;
  detail: string;
}

function StateCard({ icon, title, detail }: StateCardProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        {icon}
        <p className="text-lg font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

const ERROR_ICON = <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden />;
const EMPTY_ICON = (
  <XCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" aria-hidden />
);

/**
 * The caller's entries read failed. Pulled entries are derived from it, so
 * their absence here says nothing about the show.
 */
export function PulledEntriesUnknownCard() {
  return (
    <StateCard
      icon={ERROR_ICON}
      title="Couldn't load this show's entries"
      detail="Pulled entries come from the same read, so we don't know whether this show has any. Retry from the Registrations tab."
    />
  );
}

/** The entries read succeeded and nothing in this show was pulled. */
export function NoPulledEntriesCard({ searching }: { searching: boolean }) {
  return (
    <StateCard
      icon={EMPTY_ICON}
      title="No Pulled Entries"
      detail={
        searching ? 'No pulls match your search' : 'There are no pulled entries for this show'
      }
    />
  );
}
