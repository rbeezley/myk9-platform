/**
 * Waitlist Management Page
 *
 * The Waitlist tab of Entry Management: already scoped to one show, so it lists every waiting dog
 * in that show grouped by class (join order), or just a judge-day's classes after "View Wait
 * List" on its card. Offer a spot / remove from the waitlist (MYK9-1004); open offers are tracked
 * and can be withdrawn in the Offered group (MYK9-1001).
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ListOrdered } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { ListFilterBar, ListResultLine } from '@/components/list-toolkit';
import { useWaitlistManagementData } from './useWaitlistManagementData';
import { JudgeDayStatsCards } from './JudgeDayStatsCards';
import { WaitlistTable } from './WaitlistTable';
import { WaitlistActionDialog } from './WaitlistActionDialog';
import { OfferedWaitlistTable } from './OfferedWaitlistTable';
import { formatTrialLabel } from './trialLabel';
import { waitListSettingsQueryOptions } from '@/components/shows/waitListSettingsQuery';
import { resolveOfferWindowHours } from '@/lib/format/offerDeadline';
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
    isCapacityUnavailable,
    capacityError,
    selectedJudgeDay,
    waitlistEntries,
    groups,
    offers,
    isLoading,
    isProcessing,
    error,
    searchTerm,
    actionDialog,
    retry,
    viewJudgeDay,
    showAllClasses,
    setSearchTerm,
    setActionDialog,
    handleOfferSpot,
    handleRemoveFromWaitlist,
    handleWithdrawOffer,
  } = useWaitlistManagementData(showId);

  // The offer dialog states the window the server will give (MYK9-1002).
  const { data: waitListSettings } = useQuery(waitListSettingsQueryOptions(showId));
  // The dialog's class: a waiting dog's class card, or the open offer being withdrawn.
  const dialogClass = groups.find(g => g.cls.id === actionDialog.entry?.class_id)?.cls;
  const dialogOffer = offers.find(o => o.id === actionDialog.entry?.id);
  const offerWindow = {
    hours: waitListSettings
      ? resolveOfferWindowHours(waitListSettings.config.waitlistPaymentDeadlineHours)
      : null,
    timezone: dialogClass?.trial?.timezone ?? null,
  };
  const dialogTrialLabel = dialogOffer
    ? formatTrialLabel({ name: dialogOffer.trial_name, date: dialogOffer.trial_date })
    : formatTrialLabel(dialogClass?.trial);

  const shownCount = groups.reduce((sum, g) => sum + g.entries.length, 0);

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
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* A failed capacity read is its own state, never "no judge-days" or "0 spots". It shares
          the page's one recovery path with the queue errors. */}
      {capacityError && !isCapacityUnavailable && (
        <Alert variant="destructive" data-testid="judge-day-capacity-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-2">
            Judge-day capacity could not be loaded.
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isCapacityUnavailable && judgeDays.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="judge-day-capacity-offline">
          Judge-day capacity needs a connection, so the cards are unavailable offline. The wait
          lists below are read from this device.
        </p>
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
            <Button variant="outline" onClick={showAllClasses}>
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

      {offers.length > 0 && (
        <OfferedWaitlistTable offers={offers} onSetActionDialog={setActionDialog} />
      )}

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
        offerWindow={offerWindow}
        trialLabel={dialogTrialLabel}
        onClose={closeDialog}
        onOfferSpot={handleOfferSpot}
        onRemove={handleRemoveFromWaitlist}
        onWithdraw={handleWithdrawOffer}
      />
    </div>
  );
};

export default WaitlistManagementPage;
