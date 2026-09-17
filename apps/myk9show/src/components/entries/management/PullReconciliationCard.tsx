import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusIcon } from '@/components/status';
import { formatEntryDateTime } from '@/lib/format/dates';
import { withdrawalReasonLabel } from '@/features/registries';
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

/**
 * MYK9-632: WHICH act the row records, and whose rules decide its refund.
 * A pull is the club's call; a withdrawal carrying a recognised reason is the
 * premium's. Same queue, same refund controls, different sentence — the
 * secretary must not have to guess which one they are looking at.
 */
function removalSummary(entry: EntryManagementEntry): string {
  const reason = withdrawalReasonLabel(entry.withdrawalReasonCode);
  if (entry.rawEntryStatus === 'withdrawn' && reason) {
    return `Withdrawn · ${reason} · refund per the premium`;
  }
  return "Pulled — refund at the club's discretion";
}

export function PullReconciliationCard({
  entry,
  onOpenRefund,
  onResolved,
}: PullReconciliationCardProps) {
  const entryClass = entry.classes[0];
  const isWithdrawal = entry.rawEntryStatus === 'withdrawn';
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
              <div className="text-xs text-muted-foreground">{removalSummary(entry)}</div>
              {entry.pullReason && (
                <div className="text-xs italic text-muted-foreground">{entry.pullReason}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Pull timing drives the club-discretion default. A withdrawal's
                refund follows the premium, not the entry-close date, so the
                before/after-close chip would be answering a question nobody
                asked of it. */}
            {!isWithdrawal && <PullTimingBadge pullTiming={entry.pullTiming} />}
            <div className="text-sm text-muted-foreground">
              {isWithdrawal ? 'Withdrawn' : 'Pulled'}:{' '}
              {formatEntryDateTime(entry.pulledAt) || 'N/A'}
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
