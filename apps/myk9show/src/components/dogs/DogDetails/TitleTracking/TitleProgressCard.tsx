import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import type { TitleProgressResult } from '@/services/titleEngine';
import EarnedTitleBadge from './EarnedTitleBadge';
import NextEligibleCallout from './NextEligibleCallout';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

function formatSearchTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const hs = Math.round((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(hs).padStart(2, '0')}`;
}

interface TitleProgressCardProps {
  progress: TitleProgressResult;
}

const TitleProgressCard: React.FC<TitleProgressCardProps> = ({ progress }) => {
  const [expanded, setExpanded] = useState(false);

  const isLocked = !progress.prerequisiteMet;

  // Earned title — compact display
  if (progress.isEarned) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50">
        <EarnedTitleBadge
          abbreviation={progress.abbreviation}
          earnedDate={progress.earnedDate}
          isSuperseded={progress.isSuperseded}
        />
        <span className="text-sm text-muted-foreground truncate">{progress.fullName}</span>
      </div>
    );
  }

  // Locked title — dimmed
  if (isLocked) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30 opacity-50">
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{progress.abbreviation}</span>
        <span className="text-sm text-muted-foreground truncate">{progress.fullName}</span>
        <span className="text-xs text-muted-foreground ml-auto">Prerequisite needed</span>
      </div>
    );
  }

  // In-progress or next-eligible — expandable card
  const hasLegs = progress.legs.length > 0;
  const isLevelTitle = progress.requiredLegs === 0 || progress.requiredElementTitles.length > 0;

  return (
    <div className="rounded-lg border bg-background p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-bold text-base">{progress.abbreviation}</span>
        <span className="text-sm text-muted-foreground truncate">{progress.fullName}</span>
        <span className="text-sm font-medium ml-auto shrink-0">{progress.percentage}%</span>
      </button>

      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Leg count or element summary */}
      <div className="mt-2 text-xs text-muted-foreground">
        {isLevelTitle ? (
          <span>
            {progress.earnedElementTitles.length}/{progress.requiredElementTitles.length} element
            titles ({progress.earnedElementTitles.join(', ') || 'none yet'})
          </span>
        ) : (
          <span>
            {progress.earnedLegs}/{progress.requiredLegs} qualifying legs
          </span>
        )}
      </div>

      <NextEligibleCallout progress={progress} />

      {/* Expanded leg list */}
      {expanded && hasLegs && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Qualifying Legs
          </div>
          {progress.legs.map(leg => (
            <div key={leg.id} className="rounded bg-muted/50">
              <div className="flex items-center gap-2 text-xs py-1 px-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    leg.source === 'platform'
                      ? 'bg-primary/15 text-primary'
                      : 'bg-amber-500/15 text-warning '
                  }`}
                >
                  {leg.source === 'platform' ? 'Platform' : 'Manual'}
                </span>
                <span className="text-muted-foreground">{formatDateMMDDYYYY(leg.trial_date)}</span>
                <span className="truncate">{leg.show_name}</span>
                {leg.location && (
                  <span className="text-muted-foreground truncate">{leg.location}</span>
                )}
                {leg.search_time_seconds != null && (
                  <span className="text-muted-foreground font-mono ml-auto shrink-0">
                    {formatSearchTime(leg.search_time_seconds)}
                  </span>
                )}
                {leg.judge && !leg.search_time_seconds && (
                  <span className="text-muted-foreground truncate ml-auto">{leg.judge}</span>
                )}
              </div>
              {(leg.judge && leg.search_time_seconds != null) || leg.notes ? (
                <div className="text-xs text-muted-foreground px-2 pb-1 flex gap-3">
                  {leg.judge && leg.search_time_seconds != null && <span>{leg.judge}</span>}
                  {leg.notes && <span className="italic">{leg.notes}</span>}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Expanded element title summary for level titles */}
      {expanded && isLevelTitle && progress.requiredElementTitles.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Required Element Titles
          </div>
          {progress.requiredElementTitles.map(abbr => (
            <div
              key={abbr}
              className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/50"
            >
              {progress.earnedElementTitles.includes(abbr) ? (
                <span className="text-success-green font-bold">&#10003;</span>
              ) : (
                <span className="text-muted-foreground">&#9675;</span>
              )}
              <span>{abbr}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TitleProgressCard;
