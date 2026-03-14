/**
 * Exhibitor Home Page
 *
 * Planning-focused dashboard: stats, upcoming entries, recent results,
 * and quick action buttons. When the exhibitor has a show today, a
 * prominent alert card links them to the Show Day page.
 */

import React, { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Heart,
  Calendar,
  Search,
  FolderOpen,
  FileText,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { TipBanner } from '@/components/common/TipBanner';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { EntryRow, type DashboardEntry } from '@/components/exhibitor/EntryRow';
import { ResultRow } from '@/components/exhibitor/ResultRow';
import { useMilestones } from '@/hooks/useMilestones';
import { useEntriesQuery, useEntryStatisticsQuery } from '@/hooks/queries/useEntriesDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useAuthContext } from '@/hooks/useAuthContext';
import { FadeIn } from '@/components/layout/FadeIn';

const ExhibitorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { activeTip, dismiss: dismissTip } = useMilestones();

  useRoleRedirect({
    enabled: false,
    redirectOnRoleChange: true,
  });

  const { user } = useAuthContext();
  const showDayData = useShowDayData();

  const {
    data: rawEntries = [],
    isLoading: entriesLoading,
    error: entriesError,
  } = useEntriesQuery();
  const { data: stats } = useEntryStatisticsQuery();
  const { data: dogs = [] } = useDogsQuery();
  const { data: recentResults = [] } = useExhibitorResults();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Exhibitor';

  // Map DB entries to dashboard display shape
  const entries: DashboardEntry[] = useMemo(
    () =>
      rawEntries.map((entry: Record<string, unknown>) => ({
        id: (entry.id as string) || '',
        showId: (entry.show_id as string) || '',
        showName: ((entry.show as Record<string, unknown>)?.name as string) || 'Unknown Show',
        dogId: (entry.dog_id as string) || '',
        dogName:
          ((entry.dog as Record<string, unknown>)?.call_name as string) ||
          ((entry.dog as Record<string, unknown>)?.name as string) ||
          'Unknown Dog',
        className: ((entry.class as Record<string, unknown>)?.name as string) || 'Unknown Class',
        entryFee:
          ((entry.class as Record<string, unknown>)?.entry_fee as number) ??
          (entry.entry_fee as number) ??
          0,
        status: (entry.entry_status as string) || 'pending',
        showDate: (entry.show as Record<string, unknown>)?.start_date
          ? new Date((entry.show as Record<string, unknown>).start_date as string)
          : null,
        location: ((entry.show as Record<string, unknown>)?.location as string) || 'TBD',
        classId: (entry.class_id as string) || '',
      })),
    [rawEntries]
  );

  const upcomingEntries = useMemo(() => {
    const now = new Date();
    return entries.filter(e => e.showDate && e.showDate > now);
  }, [entries]);

  const statistics = useMemo(
    () => ({
      activeEntries: entries.filter(e => e.status === 'confirmed').length,
      totalFees: stats?.totalRevenue ?? entries.reduce((sum, entry) => sum + entry.entryFee, 0),
      upcomingShows: upcomingEntries.length,
      totalDogs: dogs.length,
    }),
    [entries, stats, dogs, upcomingEntries]
  );

  // Loading state
  if (entriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Error state
  if (entriesError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Unable to load entries. Please try again later.</p>
            <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Home</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            Welcome back, {displayName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => navigate('/shows')} size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Enter a Show
          </Button>
          <Button onClick={() => navigate('/dogs')} variant="outline" size="sm">
            <Heart className="h-4 w-4 mr-2" />
            My Dogs
          </Button>
        </div>
      </div>

      {/* Show Day alert — when the exhibitor has entries for a show happening today */}
      {showDayData.isShowDay && (
        <Link
          to="/exhibitor/show-day"
          className="flex items-center gap-3 rounded-xl border border-success-green/30 bg-gradient-to-r from-success-green/10 to-success-green/5 p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-green/20 flex-shrink-0">
            <Activity className="h-5 w-5 text-success-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">You have a show today!</p>
            <p className="text-sm text-muted-foreground">
              Check in, view run order, and see live results
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </Link>
      )}

      {/* Progressive Tip Banner */}
      {activeTip && <TipBanner tip={activeTip} onDismiss={dismissTip} />}

      {/* Compact stats row */}
      <CompactStatsRow
        activeEntries={statistics.activeEntries}
        upcomingShows={statistics.upcomingShows}
        totalDogs={statistics.totalDogs}
        onNavigate={navigate}
      />

      {/* Upcoming Entries — always visible */}
      <FadeIn>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-4">Upcoming Entries</h2>
          {upcomingEntries.length > 0 ? (
            <div className="space-y-3">
              {upcomingEntries.map(entry => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onView={() => navigate(`/shows/${entry.showId}`)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="bg-muted/50 rounded-full p-6 mb-4">
                <FolderOpen className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Upcoming Entries</h3>
              <p className="text-muted-foreground mb-6 max-w-sm text-center">
                You don't have any upcoming show entries. Browse shows to find your next
                competition.
              </p>
              <Button onClick={() => navigate('/shows')}>
                <Search className="h-4 w-4 mr-2" />
                Browse Shows
              </Button>
            </div>
          )}
        </section>
      </FadeIn>

      {/* Recent Results — collapsible */}
      {recentResults.length > 0 && (
        <CollapsibleSection title="Recent Results" count={recentResults.length} defaultOpen={false}>
          <div className="space-y-3">
            {recentResults.map(result => (
              <ResultRow
                key={result.id}
                result={result}
                onView={() =>
                  navigate(
                    result.classId ? `/classes/${result.classId}` : `/shows/${result.showId}`
                  )
                }
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Quick actions — compact button row */}
      <div className="flex flex-wrap gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate('/shows')} className="gap-2">
          <Search className="h-4 w-4" />
          Find Shows
        </Button>
        <Button variant="outline" onClick={() => navigate('/dogs')} className="gap-2">
          <Heart className="h-4 w-4" />
          My Dogs
        </Button>
        <Button variant="outline" onClick={() => navigate('/exhibitor/entries')} className="gap-2">
          <FileText className="h-4 w-4" />
          My Entries
        </Button>
      </div>
    </div>
  );
};

export default ExhibitorDashboard;
