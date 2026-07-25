import { StatusBadge } from '@/components/status';
import { TVClass, TVEntry, getTVStatusLabel, getDisplayName, formatArmband } from './types';

interface TVMobileClassCardProps {
  tvClass: TVClass;
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
  const displayName = getDisplayName(entry.dog);
  if (isInRing) {
    return (
      <div className="mb-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5">
        <StatusBadge
          family="entry"
          status="in-ring"
          label="IN RING"
          className="border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-200"
        />
        <span className="text-white text-sm font-semibold ml-1.5">
          {formatArmband(entry.armband)} {displayName}
        </span>
        {entry.handler && <span className="text-zinc-400 text-xs"> — {entry.handler}</span>}
      </div>
    );
  }
  return (
    <div className="px-2.5 py-0.5 text-xs text-zinc-500">
      {isNext && <span className="text-amber-500 text-[9px] font-semibold mr-1">NEXT</span>}
      {formatArmband(entry.armband)} {displayName}
      {entry.handler && <span className="text-zinc-600"> — {entry.handler}</span>}
    </div>
  );
}

export function TVMobileClassCard({ tvClass }: TVMobileClassCardProps) {
  const statusLabel = getTVStatusLabel(tvClass.status, tvClass.startTime);
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
        <StatusBadge
          family="class"
          status={tvClass.status}
          label={statusLabel}
          className="rounded-full border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-xs font-semibold text-zinc-200"
        />
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
