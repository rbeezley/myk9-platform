import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import { Chip } from '@/components/base/Chip';
import { formatMonthDay } from '@/utils/dateFormat';
import type { TitleProgressResult } from '@/services/titleEngine';

interface RollingTitleProgressProps {
  dogId: string;
  dogName?: string | undefined;
}

function mostRecentLegLabel(track: TitleProgressResult): string {
  if (track.legs.length === 0) return '';
  const leg = track.legs.reduce((max, cur) => (cur.trial_date > max.trial_date ? cur : max));
  return `${formatMonthDay(leg.trial_date)} · ${leg.show_name}`;
}

function getElementLevel(track: TitleProgressResult): string {
  const element = track.legs[0]?.element ?? '';
  const level = track.legs[0]?.level ?? '';
  return element && level ? `${element} ${level}` : '';
}

interface PipsProps {
  filled: number;
  total: number;
}

function Pips({ filled, total }: PipsProps) {
  return (
    <span
      className="inline-flex gap-1.5 items-center"
      aria-label={`${filled} of ${total} qualifying runs`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-3 h-3 rounded-full border-2 transition-colors',
            i < filled
              ? 'bg-[color:var(--chip-teal-fg)] border-[color:var(--chip-teal-fg)]'
              : 'bg-transparent border-muted-foreground/30'
          )}
        />
      ))}
    </span>
  );
}

function TitleRow({ track }: { track: TitleProgressResult }) {
  const label = getElementLevel(track) || track.fullName;
  const lastQ = mostRecentLegLabel(track);

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-5 py-3.5 px-4 border-t border-border/50">
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Toward <span className="font-semibold font-mono">{track.abbreviation}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Pips filled={track.earnedLegs} total={track.requiredLegs} />
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {track.earnedLegs}/{track.requiredLegs} Qs
        </span>
      </div>
      {lastQ && (
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Last Q
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{lastQ}</div>
        </div>
      )}
    </div>
  );
}

function EarnedPill({ track }: { track: TitleProgressResult }) {
  const elementLevel = getElementLevel(track);

  return (
    <Chip color="green" size="md" leadingIcon={<Check size={12} />}>
      <span className="font-mono font-bold">{track.abbreviation}</span>
      {elementLevel && <span className="ml-1 opacity-70 font-normal">· {elementLevel}</span>}
    </Chip>
  );
}

const RollingTitleProgress: React.FC<RollingTitleProgressProps> = ({ dogId, dogName }) => {
  const { progressBySport, isLoading } = useTitleProgress(dogId);

  const { inProgressTracks, earnedTitles } = useMemo(() => {
    const all = Object.values(progressBySport).flat();
    return {
      inProgressTracks: all.filter(p => !p.isEarned && p.prerequisiteMet && p.earnedLegs > 0),
      earnedTitles: all.filter(p => p.isEarned && !p.isSuperseded),
    };
  }, [progressBySport]);

  if (isLoading || (inProgressTracks.length === 0 && earnedTitles.length === 0)) {
    return null;
  }

  const displayName = dogName ?? 'this dog';

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 pt-5 pb-2 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Title progress</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            How close {displayName} is to the next title in each track
          </div>
        </div>
        {/* TODO: derive sport label from template when multi-sport dogs are supported */}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-0.5">
          Scent work
        </span>
      </div>

      {inProgressTracks.length > 0 && (
        <div className="px-2">
          {inProgressTracks.map(track => (
            <TitleRow key={track.titleId} track={track} />
          ))}
        </div>
      )}

      {earnedTitles.length > 0 && (
        <div className="px-4 pt-4 pb-5 border-t border-border/50 bg-muted/30">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Titles earned
          </div>
          <div className="flex flex-wrap gap-2">
            {earnedTitles.map(t => (
              <EarnedPill key={t.titleId} track={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RollingTitleProgress;
