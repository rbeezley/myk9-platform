/**
 * ShowDayPage — Live show day experience for exhibitors.
 *
 * Displays check-in status, run order, ring progress, and live results
 * when the exhibitor has entries for a show happening today.
 * Shows a friendly empty state when no show is active.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { CheckInStatus } from '@myk9/core';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { useSelfCheckinMap } from '@/hooks/queries/useSelfCheckinEnabled';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, Search, FileText } from 'lucide-react';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { ShowDayHero } from '@/components/exhibitor/ShowDayHero';
import { StickyShowBar } from '@/components/exhibitor/StickyShowBar';
import { EntryRow, type DashboardEntry } from '@/components/exhibitor/EntryRow';
import { ResultRow } from '@/components/exhibitor/ResultRow';
import { useEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowDayAlerts } from '@/hooks/useShowDayAlerts';
import { useShowDayRealtime } from '@/hooks/useShowDayRealtime';
import { useNotificationStore } from '@/store/notificationStore';

const ShowDayPage: React.FC = () => {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);

  useRoleRedirect({
    enabled: false,
    redirectOnRoleChange: true,
  });

  // Show day data hooks
  const showDayData = useShowDayData();
  useShowDayAlerts(showDayData);

  // Sync isInRing status to notification store for push suppression
  const setInRing = useNotificationStore(s => s.setInRing);
  useEffect(() => {
    const anyInRing = showDayData.myClasses.some(cls => cls.entryStatus === 'in-ring');
    setInRing(anyInRing);
  }, [showDayData.myClasses, setInRing]);

  const checkInMutation = useCheckInMutation();
  const classIds = useMemo(
    () => showDayData.myClasses.map(c => c.classId),
    [showDayData.myClasses]
  );
  const selfCheckinEnabledMap = useSelfCheckinMap(classIds);
  useShowDayRealtime(classIds);

  const handleCheckInChange = (entryId: string, newStatus: CheckInStatus) => {
    checkInMutation.mutate(
      { entryId, newStatus },
      { onError: () => toast.error('Could not update check-in status. Please try again.') }
    );
  };

  // Entry data for collapsed sections below hero
  const {
    data: rawEntries = [],
    isError: entriesError,
    refetch: refetchEntries,
  } = useEntriesQuery();
  const {
    data: recentResults = [],
    isError: resultsError,
    refetch: refetchResults,
  } = useExhibitorResults();

  const upcomingEntries: DashboardEntry[] = useMemo(() => {
    const now = new Date();
    return rawEntries
      .map(
        (entry: Record<string, unknown>): DashboardEntry => ({
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
        })
      )
      .filter((e: DashboardEntry) => e.showDate && e.showDate > now);
  }, [rawEntries]);

  // Loading state
  if (showDayData.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Error state
  if (showDayData.error && !showDayData.isShowDay) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Unable to load show day info. Please try again.</p>
            <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state — no active show today
  if (!showDayData.isShowDay) {
    return (
      <div className="container mx-auto px-6 py-6 max-w-7xl space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Show Day
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="bg-muted/50 rounded-full p-6 mb-4">
            <CalendarDays className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No show today</h2>
          <p className="text-muted-foreground mb-6 max-w-sm text-center">
            When you have entries for a show happening today, this is where you'll see your
            schedule, check-in, and live results.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/shows')}>
              <Search className="h-4 w-4 mr-2" />
              Find Shows
            </Button>
            <Button variant="outline" onClick={() => navigate('/exhibitor/entries')}>
              <FileText className="h-4 w-4 mr-2" />
              My Entries
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active show day
  return (
    <div className="container mx-auto px-6 py-6 max-w-7xl space-y-6 sm:space-y-8">
      {/* Sticky bar for mobile */}
      <StickyShowBar nextUp={showDayData.nextUp} heroRef={heroRef} />

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Show Day</h1>
      </div>

      {/* Show Day Hero — ring progress, next up, timeline */}
      <ShowDayHero
        ref={heroRef}
        data={showDayData}
        onCheckInChange={handleCheckInChange}
        selfCheckinEnabledMap={selfCheckinEnabledMap}
        onClassNavigate={classId => navigate(`/classes/${classId}`)}
        onManage={entryId => navigate(`/exhibitor/check-in/${entryId}`)}
      />

      {/* Collapsed entries below the hero */}
      {entriesError ? (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Failed to load entries. Please check your connection.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetchEntries()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        upcomingEntries.length > 0 && (
          <CollapsibleSection title="My Entries" count={upcomingEntries.length} defaultOpen={false}>
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
        )
      )}

      {/* Collapsed results */}
      {resultsError ? (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Failed to load recent results. Please check your connection.
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetchResults()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        recentResults.length > 0 && (
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
        )
      )}
    </div>
  );
};

export default ShowDayPage;
