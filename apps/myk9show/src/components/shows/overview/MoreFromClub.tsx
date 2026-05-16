import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useShowsByClubQuery } from '@/hooks/queries/useShowsDatabase';

// Approximate height of the rendered "More from <club>" row (heading + one row
// of 3 cards on desktop). Used as a min-height on the loading skeleton so the
// rest of the page doesn't reflow when the data arrives.
// INTENT: prevent CLS on /shows/:id Overview tab.
export const MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_PX = 180;

interface MoreFromClubProps {
  clubId: string;
  clubName: string;
  currentShowId: string;
}

export function MoreFromClub({ clubId, clubName, currentShowId }: MoreFromClubProps) {
  const { data: clubShows, isLoading } = useShowsByClubQuery(clubId);

  const otherShows = useMemo(() => {
    if (!clubShows) return [];
    return clubShows
      .filter(s => s.id !== currentShowId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 3);
  }, [clubShows, currentShowId]);

  const resolvedClubName = clubName || otherShows[0]?.clubName || 'this club';

  // While the club-shows query is in flight we don't know whether the row
  // will end up rendering or returning null. Reserve space optimistically so
  // late-arriving content can't push the page down past CLS thresholds.
  if (isLoading) {
    return (
      <div
        data-testid="more-from-club-skeleton"
        style={{ minHeight: `${MORE_FROM_CLUB_RESERVED_MIN_HEIGHT_PX}px` }}
        aria-busy="true"
      >
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (otherShows.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-bold text-foreground mb-4">More from {resolvedClubName}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {otherShows.map(show => (
          <Link key={show.id} to={`/shows/${show.id}`} className="block group">
            <Card className="p-4 h-full hover:border-primary/30 transition-colors">
              <div className="font-semibold text-foreground group-hover:text-primary transition-colors mb-2">
                {show.name}
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {show.startDate
                    ? formatDate(show.startDate.includes('T') ? show.startDate : show.startDate + 'T00:00:00')
                    : 'Date TBD'}
                </div>
                {show.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {show.location}
                  </div>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
