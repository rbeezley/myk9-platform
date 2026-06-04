import React from 'react';
import { Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEntriesByDogQuery } from '@/hooks/queries/useEntriesDatabase';
import { Link } from 'react-router-dom';

interface ActivityTabProps {
  dogId: string;
  dogName: string;
  role: 'exhibitor' | 'secretary';
}

// Typed view of the Record<string,unknown> rows from getEntriesByDog
interface EntryRow {
  id: string;
  entry_status?: string;
  result_status?: string;
  search_time_seconds?: number;
  final_placement?: string;
  show_id?: string;
  show?: { name?: string; start_date?: string; id?: string };
  class?: { name?: string; id?: string };
}

function asEntry(row: Record<string, unknown>): EntryRow {
  return row as unknown as EntryRow;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function isUpcoming(startDate?: string): boolean {
  if (!startDate) return false;
  return new Date(startDate) >= new Date(new Date().toDateString());
}

function UpcomingRow({ entry }: { entry: EntryRow }) {
  const showName = entry.show?.name ?? 'Unknown show';
  const className = entry.class?.name ?? 'Unknown class';
  const showDate = entry.show?.start_date;
  const showHref = entry.show?.id ? `/shows/${entry.show.id}` : undefined;

  return (
    <div className="flex items-start gap-4 py-3 border-t border-border first:border-t-0">
      <div className="w-16 flex-shrink-0 text-right">
        {showDate && (
          <>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {new Date(showDate).toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {new Date(showDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {showHref ? (
          <Link
            to={showHref}
            className="text-sm font-semibold hover:text-primary transition-colors"
          >
            {showName}
          </Link>
        ) : (
          <span className="text-sm font-semibold">{showName}</span>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">{className}</div>
      </div>
      <Badge variant="outline" className="text-xs flex-shrink-0 capitalize">
        {entry.entry_status ?? 'pending'}
      </Badge>
    </div>
  );
}

function ResultRow({ entry }: { entry: EntryRow }) {
  const showName = entry.show?.name ?? 'Unknown show';
  const className = entry.class?.name ?? 'Unknown class';
  const showDate = entry.show?.start_date;
  const qualified = entry.result_status === 'qualified';
  const showHref = entry.show?.id ? `/shows/${entry.show.id}` : undefined;

  return (
    <div className="flex items-start gap-4 py-3 border-t border-border first:border-t-0">
      <div className="w-16 flex-shrink-0 text-right">
        {showDate && (
          <>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {new Date(showDate).toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {new Date(showDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {showHref ? (
          <Link
            to={showHref}
            className="text-sm font-semibold hover:text-primary transition-colors"
          >
            {showName}
          </Link>
        ) : (
          <span className="text-sm font-semibold">{showName}</span>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">{className}</div>
        {entry.search_time_seconds != null && (
          <div className="font-mono text-xs text-muted-foreground mt-0.5">
            {formatTime(entry.search_time_seconds)}
            {entry.final_placement && (
              <span className="ml-2 font-sans font-medium text-amber-600">
                {entry.final_placement}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-shrink-0">
        {qualified ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />Q
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
            <XCircle className="h-3.5 w-3.5" />
            NQ
          </span>
        )}
      </div>
    </div>
  );
}

const ActivityTab: React.FC<ActivityTabProps> = ({ dogId, dogName }) => {
  const { data: rawEntries, isLoading } = useEntriesByDogQuery(dogId);

  const entries: EntryRow[] = (rawEntries ?? []).map(r => asEntry(r as Record<string, unknown>));

  const upcoming = entries
    .filter(e => e.entry_status === 'accepted' && isUpcoming(e.show?.start_date))
    .sort((a, b) => (a.show?.start_date ?? '').localeCompare(b.show?.start_date ?? ''));

  const recentResults = entries
    .filter(e => e.result_status != null)
    .sort((a, b) => (b.show?.start_date ?? '').localeCompare(a.show?.start_date ?? ''))
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-4 w-32 bg-muted animate-pulse rounded mb-3" />
              <div className="h-12 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upcoming */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Upcoming
            </span>
            {upcoming.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {upcoming.length} entr{upcoming.length === 1 ? 'y' : 'ies'} this season
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No upcoming entries for {dogName}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/shows">Find a show</Link>
              </Button>
            </div>
          ) : (
            <div>
              {upcoming.map(e => (
                <UpcomingRow key={e.id} entry={e} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent results */}
      {recentResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base font-semibold">
              <span>Recent results</span>
              <span className="text-xs font-normal text-muted-foreground">
                {recentResults.filter(e => e.result_status === 'qualified').length}/
                {recentResults.length} qualifying runs
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              {recentResults.map(e => (
                <ResultRow key={e.id} entry={e} />
              ))}
            </div>
            <div className="pt-3 border-t border-border mt-1">
              <Link
                to={`/exhibitor/analytics?dog=${dogId}`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                View full analytics for {dogName} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ActivityTab;
