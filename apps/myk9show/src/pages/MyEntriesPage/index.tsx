/**
 * MyEntriesPage
 * User's show entries management page
 * @module pages/MyEntriesPage
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { countUpcomingClassesByDog } from './modules/myEntriesStats.helpers';
import { useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { ShowTodayBanner } from '@/features/show-today/ShowTodayBanner';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { DogStrip } from '@/components/exhibitor/DogStrip';
import { FirstRunZeroState } from '@/components/exhibitor/FirstRunZeroState';
import {
  buildEntryBalanceRecoveryHref,
  summarizeEntryBalances,
} from '@/features/payments/entryBalanceSummary';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { Calendar as CalendarIcon } from 'lucide-react';
import '@/styles/myk9-show-details.css';
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useMyWaitlistEntries } from '@/hooks/queries/useMyWaitlistEntries';
import { useSelfCheckinMap } from '@/hooks/queries/useSelfCheckinEnabled';
import {
  useMyEntriesData,
  useMyEntriesFilters,
  useMyEntriesDialogs,
  useResultReveal,
  MyEntryCard,
  EntriesEmptyState,
  EntriesLoadErrorCard,
  EntriesIdentityPendingCard,
  EntryScopeBanner,
  MyEntriesDialogGroup,
  WaitListSection,
  EntryFilterStrip,
  ALL_ENTRIES_LABEL,
  ALL_ENTRIES_SCOPE_NOTE,
} from './modules';

const MyEntriesPage: React.FC = () => {
  const { user, userWithRoles, firstName } = useAuthContext();
  const checkInMutation = useCheckInMutation({ writer: 'self-checkin-rpc' });
  const { status: syncStatus } = useReplicationSync();

  // Data and filters
  const {
    entries,
    balanceSummary,
    identityState,
    isLoading,
    isError,
    refreshing,
    refreshEntries,
    updateEntryCheckIn,
  } = useMyEntriesData({
    persistCheckInStatus: checkInMutation.mutateAsync,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // Wait list. Resolved BEFORE the filters below, which need the position count:
  // `waitlist_entries` is a second source of waitlist truth that the `entries`
  // table cannot see, and the Waitlist chip counted only the half it could
  // (MYK9-417). `waitlistSurface` reconciles them.
  const { profile: exhibitorProfile } = useExhibitorProfile();
  const focusedWaitlistOfferId = searchParams.get('waitlistOffer');
  const {
    entries: waitlistEntries,
    isLoading: waitlistLoading,
    withdraw,
    startPayment,
    decline,
    refetchWaitlistOffers,
  } = useMyWaitlistEntries(exhibitorProfile?.id, focusedWaitlistOfferId);

  const {
    filteredEntries,
    selectedTab,
    selectedStatus,
    setSelectedStatus,
    statusCounts,
    setSelectedTab,
    entryStats,
    tabCounts,
    scopeMatch,
    clearScope,
    waitlistSurface,
  } = useMyEntriesFilters({
    entries,
    balanceSummary,
    waitlistPositionCount: waitlistEntries.length,
    waitlistPositionsLoading: waitlistLoading,
  });

  // Resolve the secretary's self-check-in cascade (class ?? trial ?? show ?? true)
  // for every entered class. The check-in control should reflect whether the
  // secretary has opened self-check-in — not merely whether the entry is unscored.
  const selfCheckinClassIds = useMemo(
    () =>
      Array.from(
        new Set(
          // Only unscored classes render the gated control, so resolving the
          // cascade for scored/past classes would be wasted DB reads (4 per class).
          entries.flatMap(e =>
            e.classes
              .filter(c => !c.isScored)
              .map(c => c.classId)
              .filter((id): id is string => !!id)
          )
        )
      ),
    [entries]
  );
  const selfCheckinByClassId = useSelfCheckinMap(selfCheckinClassIds);

  const navigate = useNavigate();

  // Resolve the exhibitor's person id from the same source entry loading and the
  // AddDogPanel use (legacy lookup first, then the auth record). Deriving dog
  // ownership from only userWithRoles.databaseUserId would disable the dog query
  // for exhibitors whose id comes from the legacy lookup, making the zero-state
  // wrongly treat them as having no dogs. See useMyEntriesData's personId.
  const currentUserPersonId = useCurrentUserPersonId();
  const ownerId = currentUserPersonId ?? userWithRoles?.databaseUserId ?? '';

  const { data: dogs = [], isLoading: dogsLoading } = useDogsByOwnerQuery(ownerId, !!ownerId);

  // Tri-state dog ownership for the first-run zero-state. Resolving it eagerly
  // off `dogs.length` flashes "Add Your First Dog" at an exhibitor who *does*
  // own dogs while the query is still in flight. So:
  //   - no ownerId  → the query is disabled and there can be no dogs on file → false
  //   - still loading → ownership unknown → undefined (the CTA stays dog-neutral)
  //   - settled     → the real answer
  // `undefined` is deliberately distinct from `false` so FirstRunZeroState never
  // commits to the no-dogs branch before ownership is known.
  const hasDogs: boolean | undefined = !ownerId ? false : dogsLoading ? undefined : dogs.length > 0;

  const upcomingClassCountByDog = useMemo(() => countUpcomingClassesByDog(entries), [entries]);

  const isInitialEntriesSyncing =
    entries.length === 0 &&
    areReplicationTablesPendingFirstSync(syncStatus, ['entries', 'dogs', 'classes', 'shows']);

  // The pay link must target the SAME debt the amount-due figure describes.
  // `balanceSummary` comes from the raw ungrouped rows (exhibitor-money-clarity);
  // deriving the href from the grouped entries instead could send the exhibitor
  // to a cart that disagrees with the amount they were just shown.
  const currentFeesHref = useMemo(
    () => buildEntryBalanceRecoveryHref(balanceSummary ?? summarizeEntryBalances(entries)),
    [balanceSummary, entries]
  );

  // Dialog state and the result-reveal cluster live in modules/ (MYK9-217).
  // `useResultReveal` also owns the `?resultEntryId=` deep link.
  const dialogs = useMyEntriesDialogs({ updateEntryCheckIn, refreshEntries });
  const reveal = useResultReveal(entries);

  const handleWaitlistOfferDeadlineElapsed = useCallback(() => {
    void refetchWaitlistOffers();
  }, [refetchWaitlistOffers]);

  // INTENT: the dialogs below are siblings of the page body, never children of
  // it. `isInitialEntriesSyncing` flips on replication sync ticks the exhibitor
  // never triggered, and an early `return` above the dialogs would unmount an
  // Add Dog wizard they are halfway through — silently resetting it to the
  // first tab with an empty form. The body swaps at child 0 of a stable
  // fragment; the dialogs never move from child 1. Do not reintroduce an early
  // `return` here, and do not merely duplicate the dialogs into each branch —
  // differently shaped top-level trees remount them just the same.
  const renderBody = () => {
    // Error state — only takes over the page when there is genuinely nothing to
    // show. With entries already loaded, a failed reload keeps the list on
    // screen and the same card renders inline above it (see the `inline`
    // variant); replacing a readable list with an error is the opposite of
    // "offline is normal, not broken".
    if (isError && !isLoading && entries.length === 0) {
      return <EntriesLoadErrorCard refreshing={refreshing} onRetry={refreshEntries} />;
    }

    // Loading state
    if (isLoading || isInitialEntriesSyncing) {
      return (
        <div className="bg-background">
          <div className="container mx-auto px-6 py-6 max-w-7xl">
            <div className="grid gap-8">
              <div className="h-8 bg-muted rounded-lg animate-pulse" />
              <div className="h-12 bg-muted rounded-lg animate-pulse" />
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          {/* Flex stack (not space-y) so the dog strip and the entries section can
            swap order on phones. On mobile the schedule (entries) sits directly
            under the collapsed stats; the dog strip drops below the first fold.
            Desktop keeps source order (dog strip above entries) — INTENT.md
            Exhibitor: "this respects my time". gap-8 == the prior space-y-8. */}
          <div className="flex flex-col gap-8">
            {/* A reload that failed while entries are already on screen. The
              list below stays readable; this only offers the retry. */}
            {isError && (
              <EntriesLoadErrorCard
                variant="inline"
                refreshing={refreshing}
                onRetry={refreshEntries}
              />
            )}
            {/* A flat card, not a tinted gradient. The previous primary-tinted
              gradient panel never actually rendered: opacity modifiers on
              var()-backed tokens do not compile, and only the handful written
              out by hand in index.css (see the color-mix block near line 265)
              produce any CSS at all. None of this panel's three were on that
              list, so the header has been an unpainted box the whole time.
              DESIGN.md's Flat-by-Default rule says a resting surface is carried
              by border and tone rather than decorative chroma, so it becomes a
              real card instead of a gradient that was only ever theoretical. */}
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                    My Shows
                  </h1>
                  <DashboardGreeting
                    firstName={firstName}
                    subtitle="Here's what's happening with your shows"
                    className="text-base font-medium text-muted-foreground mt-1"
                  />
                </div>
                <Button onClick={() => navigate('/shows')} className="min-h-[44px]">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Enter a Show
                </Button>
              </div>
            </div>

            {/* Canonical "Show today" entry point into /at-show (auto-favorites
              today's dogs). Replaces a stale ad-hoc card that linked to the
              retired /exhibitor/show-day route. Renders nothing when no show is
              today. This is the surface an entered exhibitor actually lands on,
              since HomeRedirect keeps them off Home (where the banner also mounts). */}
            <ShowTodayBanner />

            {/* First-run zero-state: a brand-new exhibitor with no entries would
              otherwise see all-zero stat cards, an empty dog-strip gap, and an
              empty tab — noise that reads as a data-entry chore. Suppress the
              whole stack and present one calm, adaptive call-to-action instead.
              INTENT: Exhibitor first run must feel frictionless ("respects my
              time"), never like a form to fill. */}
            {identityState !== 'resolved' ? (
              /* We do not know whose entries these are yet, so the empty list
                 below proves nothing. Rendering FirstRunZeroState here told an
                 exhibitor on a cold offline boot that they had never entered a
                 show, with their entries sitting in IndexedDB. */
              <EntriesIdentityPendingCard onRetry={refreshEntries} refreshing={refreshing} />
            ) : entries.length === 0 ? (
              <FirstRunZeroState hasDogs={hasDogs} onAddDog={dialogs.openAddDog} />
            ) : (
              <>
                <div data-testid="entry-fee-balance" className="max-[720px]:order-2">
                  <CompactStatsRow
                    currentFees={entryStats.currentFees}
                    amountDue={entryStats.currentAmountDue}
                    hasPastBalance={balanceSummary.onlineShowBalances.some(show => show.isPastShow)}
                    currentFeesHref={currentFeesHref}
                    onNavigate={navigate}
                  />
                </div>

                {/* order-3 on mobile keeps the dog strip below the primary entry
                  workflow. On desktop all three siblings are order-0, so source order
                  keeps the balance and dog strip above the entries. */}
                <div className="max-[720px]:order-3">
                  <DogStrip
                    dogs={
                      (dogs ?? []) as {
                        id: string;
                        call_name?: string;
                        name?: string;
                        image_url?: string | null;
                        date_of_birth?: string | null;
                        registrations?: {
                          breed?: string | null;
                          organization?: string | null;
                          registration_number?: string | null;
                        }[];
                      }[]
                    }
                    upcomingClassCountByDog={upcomingClassCountByDog}
                    onAddDog={dialogs.openAddDog}
                  />
                </div>

                {/* Entries section — order-1 on mobile puts the primary filters directly
                  below the hero/today context. The balance card stays intact immediately
                  after the filtered list, while the dog strip remains secondary. Desktop
                  keeps source order (balance, dogs, entries). */}
                <div data-testid="entries-filter-section" className="space-y-8 max-[720px]:order-1">
                  {/* This branch only renders when entries.length > 0, so the count
                    badge is always shown here. The scope note distinguishes this
                    all-time count from the "Current entries" stat card above,
                    which is scoped to upcoming/in-review only. */}
                  {/* A real heading, not a styled <p>. This and "My Dogs" were
                    the page's two section labels and neither was reachable by
                    heading navigation, so a screen-reader user had exactly one
                    landmark (the h1) for the whole surface. Styling unchanged. */}
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex flex-wrap items-center gap-2">
                    {ALL_ENTRIES_LABEL}
                    {/* The count badge that used to sit here is gone. The
                      "All" chip immediately below carries it — and carries it
                      SCOPED to the active status filter, so the two disagreed
                      on sight: this badge read 190 while the chip read 187.
                      What survives is the part the chips cannot say: the unit
                      these numbers count, and that past shows are included. */}
                    <span className="normal-case tracking-normal font-normal text-muted-foreground">
                      {ALL_ENTRIES_SCOPE_NOTE}
                    </span>
                  </h2>

                  {/* Inbound scope from My Payments' Receipt link. Sits above
                    the filters, not inside the list: it describes the whole
                    set the filters are narrowing, and it must stay on screen
                    when the exhibitor changes a filter. */}
                  <EntryScopeBanner
                    scopeMatch={scopeMatch}
                    totalCount={entries.length}
                    onClearScope={clearScope}
                  />

                  {/* Two composable filter axes, one visual language. Time was
                    a tablist and status a radiogroup; both narrow the same
                    list of the same cards, so both are filters now — and both
                    are named, which neither was. The "All entries · includes
                    past shows" heading above declares the unit they count. */}
                  <EntryFilterStrip
                    selectedTab={selectedTab}
                    onSelectTab={setSelectedTab}
                    tabCounts={tabCounts}
                    selectedStatus={selectedStatus}
                    onSelectStatus={setSelectedStatus}
                    statusCounts={statusCounts}
                  />

                  <div className="space-y-4">
                    {/* Changing a filter changes the list silently for a
                      screen reader — the visible count sits up in the strip
                      that was just left. Announce what the new filter
                      produced. */}
                    <p className="sr-only" role="status" aria-live="polite">
                      {filteredEntries.length === 1
                        ? '1 entry'
                        : `${filteredEntries.length} entries`}
                    </p>
                    {filteredEntries.length === 0 && waitlistSurface.allowEmptyState ? (
                      <EntriesEmptyState
                        selectedTab={selectedTab}
                        selectedStatus={selectedStatus}
                        onSwitchTab={setSelectedTab}
                      />
                    ) : (
                      // A real list, so assistive tech announces "list, N
                      // items" and offers list navigation. This was a bare
                      // stack of divs. `space-y-4` stays on the wrapper,
                      // so spacing is unchanged.
                      <ul className="space-y-4">
                        {filteredEntries.map(entry => (
                          <li key={entry.id}>
                            <MyEntryCard
                              entry={entry}
                              selfCheckinByClassId={selfCheckinByClassId}
                              onCheckInClick={dialogs.openCheckIn}
                              onEditClick={dialogs.openEdit}
                              onReceiptClick={dialogs.openReceipt}
                              onResultRevealClick={reveal.openResultReveal}
                              seenResultReleaseKeys={reveal.seenResultReleaseKeys}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Wait List Queue. Part of the filtered surface, not page
              furniture: `waitlistSurface` decides when it renders, so the
              Waitlist chip's count, this section and the empty state below
              always answer from the same rule (MYK9-417). It sits outside
              the entries branch on purpose — `add_to_waitlist` can queue a
              dog with no entry row at all, so an exhibitor whose only
              standing on this page is a wait-list position still sees it. */}
            {waitlistSurface.showPositions && (
              /* order-4 keeps the phone stack as it was when this section hung
                 off the bottom of the page: entries (1), balance (2), dogs (3),
                 wait list (4). Its siblings carry explicit orders, so an
                 unordered flex child would default to 0 and jump to the top. */
              <div className="max-[720px]:order-4">
                <WaitListSection
                  entries={waitlistEntries}
                  isLoading={waitlistLoading}
                  onWithdraw={id => withdraw.mutate(id)}
                  isWithdrawing={withdraw.isPending}
                  onStartPayment={(entryId, waitlistEntryId) => {
                    const next = new URLSearchParams(searchParams);
                    next.set('waitlistOffer', waitlistEntryId);
                    setSearchParams(next, { replace: true });
                    startPayment.mutate({ entryId, waitlistEntryId });
                  }}
                  onDecline={id => {
                    const next = new URLSearchParams(searchParams);
                    next.set('waitlistOffer', id);
                    setSearchParams(next, { replace: true });
                    decline.mutate(id);
                  }}
                  payingEntryId={
                    startPayment.isPending ? (startPayment.variables?.entryId ?? null) : null
                  }
                  decliningOfferId={decline.isPending ? (decline.variables ?? null) : null}
                  paymentError={startPayment.error?.message ?? null}
                  paymentErrorOfferId={
                    startPayment.isError ? (startPayment.variables?.waitlistEntryId ?? null) : null
                  }
                  declineError={decline.error?.message ?? null}
                  declineErrorOfferId={decline.isError ? (decline.variables ?? null) : null}
                  focusedOfferId={focusedWaitlistOfferId}
                  onOfferDeadlineElapsed={handleWaitlistOfferDeadlineElapsed}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderBody()}

      <MyEntriesDialogGroup
        user={user}
        checkInDialog={dialogs.checkInDialog}
        onCloseCheckIn={dialogs.closeCheckIn}
        onUpdateCheckInStatus={dialogs.submitCheckInStatus}
        editDialog={dialogs.editDialog}
        onCloseEdit={dialogs.closeEdit}
        onEntryUpdated={dialogs.entryUpdated}
        receiptDialog={dialogs.receiptDialog}
        onCloseReceipt={dialogs.closeReceipt}
        resultRevealModel={reveal.resultRevealModel}
        onCloseResultReveal={reveal.closeResultReveal}
        onResultRevealSeen={reveal.markSeen}
        addDogOpen={dialogs.addDogOpen}
        onCloseAddDog={dialogs.closeAddDog}
        currentUserPersonId={currentUserPersonId ?? undefined}
      />
    </>
  );
};

export default MyEntriesPage;
