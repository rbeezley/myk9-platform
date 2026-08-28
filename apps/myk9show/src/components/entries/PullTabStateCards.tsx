import type { ReactNode } from 'react';
import { AlertCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The non-list states of the Pull Management tabs.
 *
 * Split out of `PullManagementTab` so each state is stated once and the tab
 * stays under the 500-line ceiling. Keeping them together also makes the
 * distinction they exist to draw visible in one place: "we could not read this"
 * and "there is nothing here" are different claims, and the tab used to render
 * the error banner and the "none exist" card at the same time.
 */

interface StateCardProps {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}

function StateCard({ icon, title, detail, action }: StateCardProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        {icon}
        <p className="text-lg font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        {action}
      </CardContent>
    </Card>
  );
}

const ERROR_ICON = <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden />;
const EMPTY_ICON = (
  <XCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" aria-hidden />
);

/** The pull-requests read failed, so whether any exist is unknown. */
export function PullRequestsErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <StateCard
      icon={ERROR_ICON}
      title="Couldn't load pull requests"
      detail="We don't know whether this show has any pending pulls."
      action={
        <Button className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/** The read succeeded and there genuinely are none. */
export function NoPendingPullsCard({ searching }: { searching: boolean }) {
  return (
    <StateCard
      icon={EMPTY_ICON}
      title="No Pending Pull Requests"
      detail={searching ? 'No requests match your search' : 'There are no pending pull requests'}
    />
  );
}

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
