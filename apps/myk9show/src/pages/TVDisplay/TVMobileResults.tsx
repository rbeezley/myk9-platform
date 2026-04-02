import { cn } from '@/lib/utils';
import { type TVCompletedClass, getDisplayName, formatDisplayTime, formatArmband } from './types';

const MEDAL_EMOJI: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const MEDAL_BORDER: Record<number, string> = {
  1: 'border-amber-800',
  2: 'border-zinc-700',
  3: 'border-zinc-700',
  4: 'border-zinc-700',
};

interface TVMobileResultsProps {
  completedClass: TVCompletedClass;
}

export function TVMobileResults({ completedClass }: TVMobileResultsProps) {
  return (
    <div className="bg-zinc-900 rounded-lg border border-amber-900/50 mx-2 mb-2">
      <div className="px-3 py-2 flex items-center justify-between border-b border-zinc-800">
        <span className="font-semibold text-zinc-100 text-sm">{completedClass.name}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300 font-semibold">
          COMPLETED
        </span>
      </div>
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {completedClass.placements.map(p => {
          const displayName = getDisplayName(p.dog);
          const displayTime = formatDisplayTime(p.searchTime, p.totalScore);
          return (
            <div
              key={p.placement}
              className={cn(
                'bg-zinc-950 border rounded px-2 py-1.5 text-[11px]',
                MEDAL_BORDER[p.placement] ?? 'border-zinc-700'
              )}
            >
              <span>{MEDAL_EMOJI[p.placement] ?? `${p.placement}th`}</span>
              <span className="text-zinc-100 font-semibold ml-1">
                {formatArmband(p.armband)} {displayName}
              </span>
              <br />
              <span className="text-zinc-500">
                {p.handler}
                {displayTime && ` • ${displayTime}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
