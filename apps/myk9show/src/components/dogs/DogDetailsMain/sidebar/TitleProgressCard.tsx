import React from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import { Link } from 'react-router-dom';
import type { TitleProgressResult } from '@/services/titleEngine';

interface TitleProgressCardProps {
  dogId: string;
}

function Pips({ filled, total }: { filled: number; total: number }) {
  return (
    <span
      className="inline-flex gap-1 items-center"
      aria-label={`${filled} of ${total} qualifying runs`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'inline-block w-2.5 h-2.5 rounded-full border-2 transition-colors',
            i < filled ? 'bg-primary border-primary' : 'bg-transparent border-muted-foreground/30'
          )}
        />
      ))}
    </span>
  );
}

function InProgressRow({ track }: { track: TitleProgressResult }) {
  const earned = track.earnedLegs;
  const needed = track.requiredLegs;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-border first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{track.fullName}</div>
        <div className="text-xs text-muted-foreground">
          {earned}/{needed} Qs
        </div>
      </div>
      <Pips filled={earned} total={needed} />
    </div>
  );
}

const TitleProgressCard: React.FC<TitleProgressCardProps> = ({ dogId }) => {
  const { progressBySport, earnedAbbreviations, isLoading } = useTitleProgress(dogId);

  const inProgress = Object.values(progressBySport)
    .flat()
    .filter(t => !t.isEarned && !t.isSuperseded)
    .slice(0, 3);

  const earned = Object.values(progressBySport)
    .flat()
    .filter(t => t.isEarned && !t.isSuperseded)
    .slice(0, 5);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          <div className="h-8 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (inProgress.length === 0 && earned.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-1 pt-4 px-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Title progress
            </span>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">No title tracks yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Title progress
          </span>
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1">
        {inProgress.map((t, i) => (
          <InProgressRow key={i} track={t} />
        ))}

        {earnedAbbreviations.length > 0 && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-3 pb-1">
              Titles earned
            </div>
            <div className="flex flex-wrap gap-1.5">
              {earnedAbbreviations.map(abbr => (
                <span
                  key={abbr}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-success "
                >
                  {abbr}
                </span>
              ))}
            </div>
          </>
        )}

        <Button variant="outline" size="sm" className="w-full mt-3" asChild>
          <Link to={`/dogs/${dogId}?tab=title-progress`}>See full progress</Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default TitleProgressCard;
