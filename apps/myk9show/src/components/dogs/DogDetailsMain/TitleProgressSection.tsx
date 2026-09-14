/**
 * TitleProgressSection — a compact Overview orientation summary. Career ›
 * Titles owns the individual tracks, progress bars, and earned title detail.
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

interface TitleProgressSectionProps {
  dogId: string;
}

const TitleProgressSection: React.FC<TitleProgressSectionProps> = ({ dogId }) => {
  const { progressBySport, earnedAbbreviations, isLoading } = useTitleProgress(dogId);
  const tracks = Object.values(progressBySport).flat();
  // Must stay byte-identical to Career's SportTitleGroup `inProgress` filter:
  // titleEngine step 6 can mark an UNEARNED title superseded, so adding
  // `!isSuperseded` here makes Overview under-count what Career lists.
  const inProgressCount = tracks.filter(
    t => !t.isEarned && t.prerequisiteMet && t.earnedLegs > 0
  ).length;

  if (isLoading) {
    return (
      <section aria-busy="true">
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        <div className="mt-3 h-20 bg-muted animate-pulse rounded-xl" />
      </section>
    );
  }
  if (inProgressCount === 0 && earnedAbbreviations.length === 0) return null;

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
      <p className="mt-2 text-sm text-muted-foreground">
        {inProgressCount} {inProgressCount === 1 ? 'title' : 'titles'} in progress ·{' '}
        {earnedAbbreviations.length} {earnedAbbreviations.length === 1 ? 'title' : 'titles'} earned
      </p>
    </section>
  );
};

export default TitleProgressSection;
