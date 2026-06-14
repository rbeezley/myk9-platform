import React from 'react';
import { Sparkles } from 'lucide-react';
import type { TitleProgressResult } from '@/services/titleEngine';

interface NextEligibleCalloutProps {
  progress: TitleProgressResult;
}

/**
 * Motivational callout for titles that are almost earned.
 * Shows a message like "One more Q in Exterior Advanced earns SWA!"
 */
const NextEligibleCallout: React.FC<NextEligibleCalloutProps> = ({ progress }) => {
  const remaining = progress.requiredLegs - progress.earnedLegs;
  if (remaining <= 0 || remaining > 3) return null;

  const legWord = remaining === 1 ? 'leg' : 'legs';
  const message =
    progress.requiredLegs > 0
      ? `${remaining} more ${legWord} to earn ${progress.abbreviation}!`
      : `Complete remaining element titles to earn ${progress.abbreviation}!`;

  return (
    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 text-warning text-sm font-medium">
      <Sparkles className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
};

export default NextEligibleCallout;
