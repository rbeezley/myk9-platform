import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CalendarDays, MapPin } from 'lucide-react';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';

interface MoreFromClubProps {
  clubId: string;
  clubName: string;
  currentShowId: string;
}

export function MoreFromClub({ clubId, clubName, currentShowId }: MoreFromClubProps) {
  const { data: allShows } = useShowsQuery();

  const otherShows = useMemo(() => {
    if (!allShows) return [];
    return allShows
      .filter(s => s.clubId === clubId && s.id !== currentShowId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 3);
  }, [allShows, clubId, currentShowId]);

  if (otherShows.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-bold text-foreground mb-4">More from {clubName}</h3>
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
                  {new Date(show.startDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
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
