import { cn } from '@/lib/utils';
import { TV_STATUS_CONFIG, TVClass, TVEntry } from './types';

interface TVMobileClassCardProps {
  tvClass: TVClass;
}

function getStatusBadge(status: string | null) {
  const config = TV_STATUS_CONFIG[status as keyof typeof TV_STATUS_CONFIG];
  return config ?? { label: status ?? 'UNKNOWN', color: 'bg-zinc-600 text-zinc-200' };
}

function MobileEntry({
  entry,
  isInRing,
  isNext,
}: {
  entry: TVEntry;
  isInRing: boolean;
  isNext: boolean;
}) {
  const displayName = entry.dog?.callName ?? entry.dog?.name ?? 'Unknown';
  if (isInRing) {
    return (
      <div className="bg-blue-950 border border-blue-600 rounded px-2.5 py-1.5 mb-1">
        <span className="text-blue-400 text-[9px] font-semibold">IN RING</span>
        <span className="text-white text-sm font-semibold ml-1.5">
          #{entry.armband} {displayName}
        </span>
        {entry.handler && <span className="text-zinc-400 text-xs"> — {entry.handler}</span>}
      </div>
    );
  }
  return (
    <div className="px-2.5 py-0.5 text-xs text-zinc-500">
      {isNext && <span className="text-amber-500 text-[9px] font-semibold mr-1">NEXT</span>}#
      {entry.armband} {displayName}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVMobileClassCard({ tvClass }: TVMobileClassCardProps) {
  const { label, color } = getStatusBadge(tvClass.status);
  const inRingEntry = tvClass.entries.find(e => e.isInRing);
  const pendingEntries = tvClass.entries.filter(e => !e.isInRing && !e.isScored).slice(0, 3);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-700 mx-2 mb-2">
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
        <div>
          <span className="font-semibold text-zinc-100 text-sm">{tvClass.name}</span>
          {tvClass.judgeName && (
            <span className="text-zinc-600 text-[11px] ml-1.5">Judge: {tvClass.judgeName}</span>
          )}
        </div>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', color)}>
          {label}
        </span>
      </div>
      <div className="p-2">
        {inRingEntry && <MobileEntry entry={inRingEntry} isInRing isNext={false} />}
        {pendingEntries.map((e, i) => (
          <MobileEntry key={e.id} entry={e} isInRing={false} isNext={i === 0} />
        ))}
        {tvClass.totalEntries != null && tvClass.scoredCount != null && (
          <div className="px-2.5 pt-1 pb-1 text-[11px] text-zinc-600">
            {tvClass.scoredCount} of {tvClass.totalEntries} scored
          </div>
        )}
      </div>
    </div>
  );
}
