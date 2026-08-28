import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusIcon } from '@/components/status';
import { formatEntryDateTime } from '@/lib/format/dates';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationActions } from './PullReconciliationActions';

interface PullReconciliationCardProps {
  entry: EntryManagementEntry;
  onOpenRefund: (entry: EntryManagementEntry) => void;
  onResolved: () => void;
}

/**
 * Pull-timing chip.
 *
 * Uses the semantic `--success` / `--warning` tokens rather than raw Tailwind
 * palette classes. The previous `bg-green-50` / `bg-orange-50` / `bg-gray-50`
 * backgrounds are fixed near-white at every theme, so in dark mode these were
 * the only glaring light patches on the page -- the project watchlist's first
 * entry, in its light-only direction.
 */
function PullTimingBadge({ pullTiming }: { pullTiming: EntryManagementEntry['pullTiming'] }) {
  if (pullTiming === 'before_close') {
    return (
      <Badge variant="outline" className="bg-success/10 text-success">
        Before close
      </Badge>
    );
  }
  if (pullTiming === 'after_close') {
    return (
      <Badge variant="outline" className="bg-warning/10 text-warning">
        After close
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      Timing unknown
    </Badge>
  );
}

export function PullReconciliationCard({
  entry,
  onOpenRefund,
  onResolved,
}: PullReconciliationCardProps) {
  const entryClass = entry.classes[0];
  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <StatusIcon family="entry" status="pulled" decorative />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{entry.dogName || 'Unknown Dog'}</span>
                {entry.armbandNumber && <Badge variant="outline">#{entry.armbandNumber}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {entryClass?.number && `#${entryClass.number} - `}
                {entryClass?.name}
              </div>
              {entry.pullReason && (
                <div className="text-xs italic text-muted-foreground">{entry.pullReason}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <PullTimingBadge pullTiming={entry.pullTiming} />
            <div className="text-sm text-muted-foreground">
              Pulled: {formatEntryDateTime(entry.pulledAt) || 'N/A'}
            </div>
            <PullReconciliationActions
              entry={entry}
              onOpenRefund={onOpenRefund}
              onResolved={onResolved}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
