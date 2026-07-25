import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StatusIcon } from '@/components/status';
import { CheckInClassRow } from './CheckInClassRow';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

function getSummaryEntryStatus(summaryStatus: ExhibitorCheckInGroup['summaryStatus']) {
  if (summaryStatus === 'checked-in') return 'checked-in';
  if (summaryStatus === 'partial') return 'pending';
  return 'no-status';
}

interface CheckInExhibitorCardProps {
  group: ExhibitorCheckInGroup;
  onCheckIn: (entryId: string) => void;
  onCheckInAll: (entryIds: string[]) => void;
  secretaryCheckedIds?: Set<string>;
}

export function CheckInExhibitorCard({
  group,
  onCheckIn,
  onCheckInAll,
  secretaryCheckedIds = new Set(),
}: CheckInExhibitorCardProps) {
  const [expanded, setExpanded] = useState(false);

  const uncheckedEntryIds = group.entries
    .filter(e => e.checkInStatus === 'no-status' || !e.checkInStatus)
    .map(e => e.entryId);

  const summaryEntryStatus = getSummaryEntryStatus(group.summaryStatus);
  const isDone = group.summaryStatus === 'checked-in';

  return (
    <div
      className="rounded-lg border-l-[3px] border-l-border bg-card shadow-card"
      style={{ opacity: isDone ? 0.7 : 1 }}
    >
      <div
        data-testid="exhibitor-card-header"
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-muted px-2.5 py-0.5 text-sm font-bold tabular-nums">
            #{group.armbandNumber}
          </span>
          <div>
            <div className="text-sm font-semibold">{group.handlerName}</div>
            <div className="text-xs text-muted-foreground">
              {group.dogName} &middot; {group.checkedInCount}/{group.totalEntries} checked in
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}

          <StatusIcon family="entry" status={summaryEntryStatus} size="lg" decorative />

          {!isDone && (
            <Button
              size="sm"
              className="h-8"
              onClick={e => {
                e.stopPropagation();
                onCheckInAll(uncheckedEntryIds);
              }}
            >
              {group.summaryStatus === 'none' ? 'Check In All' : 'Check In Rest'}
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-1 px-4 pb-3" style={{ marginLeft: 54 }}>
          {group.entries.map(entry => (
            <CheckInClassRow
              key={entry.entryId}
              entryId={entry.entryId}
              className={entry.className}
              checkInStatus={entry.checkInStatus}
              onCheckIn={onCheckIn}
              checkedBySecretary={secretaryCheckedIds.has(entry.entryId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
