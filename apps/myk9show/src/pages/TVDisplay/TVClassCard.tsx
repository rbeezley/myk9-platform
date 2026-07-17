import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/status';
import { TVClass, TVEntry, getTVStatusLabel, getDisplayName, formatArmband } from './types';

interface TVClassCardProps {
  tvClass: TVClass;
  highlighted?: boolean;
  maxNextUp?: number;
}

function InRingEntry({ entry }: { entry: TVEntry }) {
  return (
    <div className="mb-2 rounded-md border border-zinc-700 bg-zinc-900 p-2">
      <StatusBadge
        family="entry"
        status="in-ring"
        label="IN RING"
        className="border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-200"
      />
      <div className="mt-0.5">
        <span className="text-white font-semibold">
          {formatArmband(entry.armband)} {getDisplayName(entry.dog)}
        </span>
        {entry.handler && <span className="text-zinc-400 text-sm ml-1">— {entry.handler}</span>}
      </div>
    </div>
  );
}

function NextUpEntry({ entry, isNext }: { entry: TVEntry; isNext: boolean }) {
  return (
    <div
      className={cn(
        'px-3 py-1 text-sm border-b border-zinc-800',
        isNext ? 'text-zinc-200' : 'text-zinc-500'
      )}
    >
      {isNext && <span className="text-amber-500 text-xs font-semibold mr-1.5">NEXT</span>}
      {formatArmband(entry.armband)} {getDisplayName(entry.dog)}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVClassCard({ tvClass, highlighted, maxNextUp = 5 }: TVClassCardProps) {
  const statusLabel = getTVStatusLabel(tvClass.status, tvClass.startTime);
  const inRingEntry = tvClass.entries.find(e => e.isInRing);
  const pendingEntries = tvClass.entries
    .filter(e => !e.isInRing && !e.isScored)
    .slice(0, maxNextUp);

  return (
    <div
      className={cn(
        'bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden transition-all',
        highlighted && 'animate-pulse-border'
      )}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-700">
        <div>
          <span className="font-bold text-zinc-100 text-sm">{tvClass.name}</span>
          {tvClass.judgeName && (
            <span className="text-zinc-500 text-xs ml-2">Judge: {tvClass.judgeName}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tvClass.totalEntries != null && tvClass.scoredCount != null && (
            <span className="text-xs text-zinc-500">
              {tvClass.scoredCount} / {tvClass.totalEntries}
            </span>
          )}
          <StatusBadge
            family="class"
            status={tvClass.status}
            label={statusLabel}
            className="rounded-full border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-200"
          />
        </div>
      </div>
      <div className="p-3">
        {inRingEntry && <InRingEntry entry={inRingEntry} />}
        {pendingEntries.map((entry, i) => (
          <NextUpEntry key={entry.id} entry={entry} isNext={i === 0} />
        ))}
        {!inRingEntry && pendingEntries.length === 0 && (
          <div className="text-zinc-600 text-sm text-center py-2">No entries in queue</div>
        )}
      </div>
    </div>
  );
}
