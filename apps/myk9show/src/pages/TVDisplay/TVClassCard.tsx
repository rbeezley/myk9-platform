import { cn } from '@/lib/utils';
import { TV_STATUS_CONFIG, TVClass, TVEntry } from './types';

interface TVClassCardProps {
  tvClass: TVClass;
  highlighted?: boolean;
  maxNextUp?: number;
}

function getStatusBadge(status: string | null, startTime: string | null) {
  if (status === 'start_time' && startTime) {
    return { label: `STARTS ${startTime}`, color: 'bg-zinc-600 text-zinc-200' };
  }
  const config = TV_STATUS_CONFIG[status as keyof typeof TV_STATUS_CONFIG];
  return config ?? { label: status ?? 'UNKNOWN', color: 'bg-zinc-600 text-zinc-200' };
}

function InRingEntry({ entry }: { entry: TVEntry }) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';
  return (
    <div className="bg-blue-950 border border-blue-600 rounded-md p-2 mb-2">
      <span className="text-blue-400 text-xs font-semibold">IN RING</span>
      <div className="mt-0.5">
        <span className="text-white font-semibold">
          #{entry.armband} {displayName}
        </span>
        {entry.handler && <span className="text-zinc-400 text-sm ml-1">— {entry.handler}</span>}
      </div>
    </div>
  );
}

function NextUpEntry({ entry, isNext }: { entry: TVEntry; isNext: boolean }) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';
  return (
    <div
      className={cn(
        'px-3 py-1 text-sm border-b border-zinc-800',
        isNext ? 'text-zinc-200' : 'text-zinc-500'
      )}
    >
      {isNext && <span className="text-amber-500 text-xs font-semibold mr-1.5">NEXT</span>}#
      {entry.armband} {displayName}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVClassCard({ tvClass, highlighted, maxNextUp = 5 }: TVClassCardProps) {
  const { label, color } = getStatusBadge(tvClass.status, tvClass.startTime);
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
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-semibold', color)}>
            {label}
          </span>
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
