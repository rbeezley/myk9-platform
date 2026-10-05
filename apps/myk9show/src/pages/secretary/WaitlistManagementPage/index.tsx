/**
 * Waitlist Management Page
 *
 * The Waitlist tab of Entry Management: already scoped to one show, so it lists every waiting dog
 * in that show grouped by class (join order), or just a judge-day's classes after "View Wait
 * List" on its card. Offer a spot / remove from the waitlist (MYK9-1004).
 */

import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ListOrdered } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { ListFilterBar, ListResultLine } from '@/components/list-toolkit';
import { useWaitlistManagementData } from './useWaitlistManagementData';
import { JudgeDayStatsCards } from './JudgeDayStatsCards';
import { WaitlistTable } from './WaitlistTable';
import { WaitlistActionDialog } from './WaitlistActionDialog';
import { WaitListSettingsCard } from '@/components/shows/WaitListSettingsCard';
import { AccessRestrictedState } from './EmptyStates';
import { JudgeCapacityOverview } from '@/components/waitlist/JudgeCapacityOverview';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePageExportAction } from '@/features/actions/pageEditTarget';
import { exportRowsCsv } from '@/utils/downloadCsv';
import { formatWeekdayMonthDay } from '@/lib/format/dates';

interface WaitlistManagementPageProps {
  showId: string;
}

const WaitlistManagementPage: React.FC<WaitlistManagementPageProps> = ({ showId }) => {
  const { hasRole } = useAuthContext();

  const {
    judgeDays,
    selectedJudgeDay,
    waitlistEntries,
    groups,
    isLoadingClasses,
    isLoadingWaitlist,
    isProcessing,
    error,
    searchTerm,
    actionDialog,
    reload,
    viewJudgeDay,
    showAllClasses,
    setSearchTerm,
    setActionDialog,
    handleOfferSpot,
    handleRemoveFromWaitlist,
  } = useWaitlistManagementData(showId);

  const shownCount = groups.reduce((sum, g) => sum + g.entries.length, 0);
  const isLoading = isLoadingClasses || isLoadingWaitlist;

  // One export for the whole page: exactly the rows on screen, class by class.
  usePageExportAction({
    id: 'waitlist',
    enabled: shownCount > 0,
    run: () =>
      exportRowsCsv(
        'waitlist',
        ['Class', 'Position', 'Dog', 'Added'],
        groups.flatMap(({ cls, entries }) =>
          entries.map(entry => [
            cls.name,
            entry.position,
            entry.dog?.call_name ?? entry.dog?.name ?? '',
            entry.created_at ?? '',
          ])
        )
      ),
  });

  // Verify secretary role access
  if (
    !hasRole(UserRole.SECRETARY) &&
    !hasRole(UserRole.CLUB_ADMIN) &&
    !hasRole(UserRole.SITE_ADMIN)
  ) {
    return <AccessRestrictedState />;
  }

  const closeDialog = () => {
    setActionDialog({ open: false, action: null, entry: null });
  };

  return (
    <div className="space-y-6">
      {/* MYK9-999: judge-day capacity, offer window and mail-in hold live here, scoped to the show
          the tab is showing. The card also holds the show's automatic-offer switch (MYK9-1003). */}
      <details className="rounded-lg border bg-card" data-testid="waitlist-settings-disclosure">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Wait list settings: automatic offers, judge-day capacity, offer window, mail-in hold
        </summary>
        <div className="px-4 pb-4">
          <WaitListSettingsCard key={showId} showId={showId} />
        </div>
      </details>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            {error}
            <Button variant="outline" size="sm" onClick={reload}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {judgeDays.length > 0 && (
        <JudgeCapacityOverview judgeDays={judgeDays} onViewWaitList={viewJudgeDay} />
      )}

      {selectedJudgeDay && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">
              Wait list for {selectedJudgeDay.judgeName},{' '}
              {formatWeekdayMonthDay(selectedJudgeDay.showDate)}
            </h3>
            <Button variant="outline" size="sm" onClick={showAllClasses}>
              Show every class
            </Button>
          </div>
          <JudgeDayStatsCards judgeDay={selectedJudgeDay} />
        </>
      )}

      <ListFilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by dog..."
        fields={[]}
      />
      <ListResultLine
        ready={!isLoading && !error}
        shown={shownCount}
        total={waitlistEntries.length}
        noun={['dog', 'dogs']}
        filtered={searchTerm !== ''}
        onShowAll={() => setSearchTerm('')}
      />

      {groups.map(({ cls, entries }) => (
        <WaitlistTable
          key={cls.id}
          entries={entries}
          selectedClass={cls}
          isLoading={false}
          searchActive={searchTerm !== ''}
          onSetActionDialog={setActionDialog}
        />
      ))}

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <ListOrdered className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mb-2 text-lg font-medium">
              {isLoading
                ? 'Loading wait lists...'
                : searchTerm
                  ? 'No dogs match your search'
                  : selectedJudgeDay
                    ? 'No dogs are waiting on this judge-day'
                    : 'No dogs are waiting in this show'}
            </h3>
          </CardContent>
        </Card>
      )}

      <WaitlistActionDialog
        actionDialog={actionDialog}
        isProcessing={isProcessing}
        onClose={closeDialog}
        onOfferSpot={handleOfferSpot}
        onRemove={handleRemoveFromWaitlist}
      />
    </div>
  );
};

export default WaitlistManagementPage;
