/**
 * Exhibitor Dashboard Page
 *
 * Context-aware dashboard with progressive disclosure:
 * - Show day: ShowDayHero with live ring progress, entries/results collapsed below
 * - Non-show day: CompactStatsRow, upcoming entries, collapsible results, action buttons
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { CheckInStatus } from '@myk9/core';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Heart,
  Calendar,
  Search,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Clock,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { ResultBadge } from '@/components/common/ResultBadge';
import { TipBanner } from '@/components/common/TipBanner';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { ShowDayHero } from '@/components/exhibitor/ShowDayHero';
import { StickyShowBar } from '@/components/exhibitor/StickyShowBar';
import { useMilestones } from '@/hooks/useMilestones';
import { useEntriesQuery, useEntryStatisticsQuery } from '@/hooks/queries/useEntriesDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowDayAlerts } from '@/hooks/useShowDayAlerts';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { format } from 'date-fns';
import { FadeIn } from '@/components/layout/FadeIn';

interface DashboardEntry {
  id: string;
  showId: string;
  showName: string;
  dogId: string;
  dogName: string;
  className: string;
  entryFee: number;
  status: string;
  showDate: Date | null;
  location: string;
  classId: string;
}

const ExhibitorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { activeTip, dismiss: dismissTip } = useMilestones();

  useRoleRedirect({
    enabled: false,
    redirectOnRoleChange: true,
  });

  // Data hooks
  const { user } = useAuthContext();
  const showDayData = useShowDayData();
  useShowDayAlerts(showDayData);

  // Sync isInRing status to notification store for push suppression
  const setInRing = useNotificationStore(s => s.setInRing);
  useEffect(() => {
    const anyInRing = showDayData.myClasses.some(cls => cls.entryStatus === 'in-ring');
    setInRing(anyInRing);
  }, [showDayData.myClasses, setInRing]);

  const {
    data: rawEntries = [],
    isLoading: entriesLoading,
    error: entriesError,
  } = useEntriesQuery();
  const { data: stats } = useEntryStatisticsQuery();
  const { data: dogs = [] } = useDogsQuery();
  const { data: recentResults = [] } = useExhibitorResults();
  const checkInMutation = useCheckInMutation();

  const handleCheckInChange = useCallback(
    (entryId: string, newStatus: CheckInStatus) => {
      checkInMutation.mutate(
        { entryId, newStatus },
        { onError: () => toast.error('Could not update check-in status. Please try again.') }
      );
    },
    [checkInMutation.mutate]
  );

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
  if (entriesLoading && !showDayData.isShowDay) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Error state
  if (entriesError && !showDayData.isShowDay) {
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
      {/* Sticky bar for show day (mobile only) */}
      {showDayData.isShowDay && <StickyShowBar nextUp={showDayData.nextUp} heroRef={heroRef} />}

      {/* Header — compact on show day, full on planning day */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {showDayData.isShowDay ? 'Show Day' : 'Exhibitor Dashboard'}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-1">
            Welcome back, {displayName}
          </p>
        </div>

        {!showDayData.isShowDay && (
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
        )}
      </div>

      {/* Progressive Tip Banner */}
      {activeTip && <TipBanner tip={activeTip} onDismiss={dismissTip} />}

      {/* ---- SHOW DAY LAYOUT ---- */}
      {showDayData.isShowDay && (
        <>
          <ShowDayHero ref={heroRef} data={showDayData} onCheckInChange={handleCheckInChange} />

          {/* Collapsed sections below the hero */}
          {upcomingEntries.length > 0 && (
            <CollapsibleSection
              title="My Entries"
              count={upcomingEntries.length}
              defaultOpen={false}
            >
              <div className="space-y-3">
                {upcomingEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onView={() => navigate(`/shows/${entry.showId}`)}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {recentResults.length > 0 && (
            <CollapsibleSection
              title="Recent Results"
              count={recentResults.length}
              defaultOpen={false}
            >
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
        </>
      )}

      {/* ---- NON-SHOW DAY LAYOUT ---- */}
      {!showDayData.isShowDay && (
        <>
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
            <CollapsibleSection
              title="Recent Results"
              count={recentResults.length}
              defaultOpen={false}
            >
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
            <Button
              variant="outline"
              onClick={() => navigate('/exhibitor/entries')}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              My Entries
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExhibitorDashboard;

// ---------------------------------------------------------------------------
// Sub-components (internal to this file)
// ---------------------------------------------------------------------------

const ROW_BUTTON_CLASS =
  'w-full text-left flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-card/90 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[48px]';

const STATUS_BADGE_STYLES: Record<string, string> = {
  confirmed: 'bg-success-green/10 text-success-green border-success-green/20',
  pending: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
  cancelled: 'bg-error-red/10 text-error-red border-error-red/20',
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
};

/** Collapsible section with title and item count */
function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors min-h-[48px] w-full text-left"
        aria-expanded={open}
      >
        {title} ({count})
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}

/** Compact entry row for upcoming entries */
function EntryRow({ entry, onView }: { entry: DashboardEntry; onView: () => void }) {
  const badgeStyle =
    STATUS_BADGE_STYLES[entry.status] ?? 'bg-muted text-muted-foreground border-border';
  const badgeLabel = STATUS_LABELS[entry.status] ?? 'Unknown';

  return (
    <button
      type="button"
      onClick={onView}
      className={ROW_BUTTON_CLASS}
      aria-label={`${entry.showName}, ${entry.dogName}, ${entry.className}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <span className="font-semibold text-foreground truncate">{entry.showName}</span>
          <Badge className={badgeStyle}>{badgeLabel}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
          <span>{entry.dogName}</span>
          <span>&bull; {entry.className}</span>
          {entry.showDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(entry.showDate, 'MMM d')}
            </span>
          )}
          {entry.location !== 'TBD' && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {entry.location}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

/** Compact result row */
function ResultRow({
  result,
  onView,
}: {
  result: {
    id: string;
    resultStatus: string;
    showName: string;
    dogCallName: string;
    className: string;
    classElement: string | null;
    classLevel: string | null;
    showDate: string;
    searchTimeSeconds: number | null;
    totalFaults: number | null;
    finalPlacement: number | null;
  };
  onView: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onView}
      className={ROW_BUTTON_CLASS}
      aria-label={`${result.showName}, ${result.dogCallName}, ${result.className}, ${result.resultStatus}`}
    >
      <ResultBadge resultStatus={result.resultStatus} variant="large" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-foreground truncate block">{result.showName}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{result.dogCallName}</span>
          <span>
            {result.className}
            {result.classElement ? ` — ${result.classElement}` : ''}
            {result.classLevel ? ` ${result.classLevel}` : ''}
          </span>
          {result.showDate && <span>{format(new Date(result.showDate), 'MMM d, yyyy')}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm">
          {result.searchTimeSeconds != null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {result.searchTimeSeconds.toFixed(1)}s
            </span>
          )}
          {result.totalFaults != null && result.totalFaults > 0 && (
            <span className="flex items-center gap-1 text-warning-orange">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.totalFaults} fault{result.totalFaults !== 1 ? 's' : ''}
            </span>
          )}
          {result.finalPlacement != null && result.finalPlacement > 0 && (
            <span className="text-muted-foreground">Placement: {result.finalPlacement}</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}
