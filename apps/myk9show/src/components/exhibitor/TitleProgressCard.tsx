/**
 * TitleProgressCard — Free-tier visible title summary for My Shows.
 *
 * Shows each dog's earned title abbreviations at a glance. No gating — every
 * exhibitor should see their progress without hunting through the dog detail page.
 *
 * INTENT: Titles feel like achievements you've *already* earned, surfaced where you
 * live (My Shows), not buried behind a premium tab.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, ChevronRight, PawPrint } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTitleProgress } from '@/hooks/useTitleProgress';

// ── Per-dog row ───────────────────────────────────────────────────────────────

interface DogTitleRowProps {
  dogId: string;
  dogName: string;
}

const DogTitleRow: React.FC<DogTitleRowProps> = ({ dogId, dogName }) => {
  const navigate = useNavigate();
  const { earnedAbbreviations, isLoading } = useTitleProgress(dogId);

  // While loading, show a subtle placeholder
  if (isLoading) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <PawPrint className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{dogName}</span>
        </div>
        <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate(`/dogs/${dogId}?tab=title-progress`)}
      className="w-full flex items-center justify-between gap-3 py-2 rounded-lg hover:bg-muted/40 active:scale-[0.99] transition-all duration-200 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 -mx-2 px-2"
      aria-label={`View title progress for ${dogName}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <PawPrint className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{dogName}</span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {earnedAbbreviations.length > 0 ? (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {earnedAbbreviations.join(' · ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">No titles yet</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
    </button>
  );
};

// ── Card ──────────────────────────────────────────────────────────────────────

interface Dog {
  id: string;
  call_name?: string | null;
  name?: string | null;
}

interface TitleProgressCardProps {
  dogs: Dog[];
}

export const TitleProgressCard: React.FC<TitleProgressCardProps> = ({ dogs }) => {
  if (dogs.length === 0) return null;

  return (
    <Card className="rounded-2xl border border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          Title Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/50">
          {dogs.map(dog => (
            <DogTitleRow
              key={dog.id}
              dogId={dog.id}
              dogName={dog.call_name || dog.name || 'Unknown Dog'}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TitleProgressCard;
