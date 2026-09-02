/**
 * TitleProgressSection — the first Overview section: tracks in progress and
 * titles earned, with a link into Career › Titles for the full picture.
 *
 * Premium-only, mounted by DogDetailsTabs. INTENT: free users see no teaser
 * here — Career's locked-view treatment is the single upgrade path for Title
 * Progress and Statistics, so Overview never repeats a competing upgrade card
 * (spec: exhibitor-dog-management "Premium locks preserve the free dog
 * workspace").
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import type { TitleProgressResult } from '@/services/titleEngine';

interface TitleProgressSectionProps {
  dogId: string;
}

function TrackCard({ track }: { track: TitleProgressResult }) {
  const pct = track.requiredLegs > 0 ? Math.round((track.earnedLegs / track.requiredLegs) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="text-sm font-semibold text-foreground truncate">{track.fullName}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {track.earnedLegs} of {track.requiredLegs} qualifying runs
      </div>
      <div
        role="progressbar"
        aria-label={`${track.fullName} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const TitleProgressSection: React.FC<TitleProgressSectionProps> = ({ dogId }) => {
  const { progressBySport, earnedAbbreviations, isLoading } = useTitleProgress(dogId);
  const tracks = Object.values(progressBySport).flat();
  const inProgress = tracks.filter(t => !t.isEarned && !t.isSuperseded).slice(0, 3);

  if (isLoading) {
    return (
      <section aria-busy="true">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        <div className="mt-3 h-20 bg-muted animate-pulse rounded-xl" />
      </section>
    );
  }
  if (inProgress.length === 0 && earnedAbbreviations.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" aria-hidden />
          Title progress
        </h2>
        <Link
          to={`/dogs/${dogId}?section=career&view=titles`}
          className="text-sm text-primary hover:underline"
        >
          See full progress
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {inProgress.map(track => (
          <TrackCard key={track.titleId} track={track} />
        ))}
        {earnedAbbreviations.length > 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-3.5">
            <div className="text-sm font-semibold text-foreground">Titles earned</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {earnedAbbreviations.map(abbr => (
                <span
                  key={abbr}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-success"
                >
                  {abbr}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default TitleProgressSection;
