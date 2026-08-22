/**
 * MyEntriesPage
 * User's show entries management page
 * @module pages/MyEntriesPage
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
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
import { CheckInStatus } from '@/types/check-in-types';
import {
  buildResultCardModel,
  buildResultCardVisibility,
  hasSeenResultReveal,
  markResultRevealSeen,
  type ResultCardModel,
} from '@/features/result-card';
import { useCheckInMutation } from '@/hooks/mutations/useCheckInMutation';
import { Calendar as CalendarIcon } from 'lucide-react';
import '@/styles/myk9-show-details.css';
import { DashboardGreeting } from '@/components/ui/DashboardGreeting';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { useMyWaitlistEntries } from '@/hooks/queries/useMyWaitlistEntries';
import { useSelfCheckinMap } from '@/hooks/queries/useSelfCheckinEnabled';
import { toDogEntryView } from './modules/myEntryDogView';
import {
  useMyEntriesData,
  useMyEntriesFilters,
  MyEntryCard,
  EntriesEmptyState,
  EntriesLoadErrorCard,
  EntryScopeBanner,
  MyEntriesDialogGroup,
  WaitListSection,
  ENTRY_TAB_DEFS,
  EntryStatusFilterChips,
  ALL_ENTRIES_LABEL,
  ALL_ENTRIES_SCOPE_NOTE,
  type MyEntry,
  type EntryClass,
  type CheckInDialogState,
  type EditDialogState,
  type ReceiptDialogState,
  type EntryTabFilter,
} from './modules';

const MyEntriesPage: React.FC = () => {
  const { user, userWithRoles, firstName } = useAuthContext();
  const checkInMutation = useCheckInMutation({ writer: 'self-checkin-rpc' });
  const { status: syncStatus } = useReplicationSync();

  // Data and filters
  const {
    entries,
    balanceSummary,
    isLoading,
    isError,
    refreshing,
    refreshEntries,
    updateEntryCheckIn,
  } = useMyEntriesData({
    persistCheckInStatus: checkInMutation.mutateAsync,
  });
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
  } = useMyEntriesFilters({
    entries,
    balanceSummary,
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
  const [searchParams, setSearchParams] = useSearchParams();

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

  const entryTabs = useMemo<PrimaryTabDef[]>(
    () =>
      ENTRY_TAB_DEFS.map(tab => ({
        ...tab,
        count: tabCounts[tab.id],
      })),
    [tabCounts]
  );

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

  // Dialog states
  const [checkInDialog, setCheckInDialog] = useState<CheckInDialogState>({
    open: false,
    entry: null,
    classEntry: null,
  });

  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    entry: null,
  });

  const [receiptDialog, setReceiptDialog] = useState<ReceiptDialogState>({
    open: false,
    entry: null,
  });
  const [resultRevealModel, setResultRevealModel] = useState<ResultCardModel | null>(null);
  const [seenResultReleaseKeys, setSeenResultReleaseKeys] = useState<Set<string>>(() => {
    return new Set();
  });

  const [addDogOpen, setAddDogOpen] = useState(false);

  // Waitlist
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

  const handleWaitlistOfferDeadlineElapsed = useCallback(() => {
    void refetchWaitlistOffers();
  }, [refetchWaitlistOffers]);

  // Handlers — stable identities so the memoized MyEntryCard list doesn't
  // re-render every card when an unrelated dialog opens or a tab changes.
  const handleCheckInClick = useCallback((entry: MyEntry, classEntry: EntryClass) => {
    setCheckInDialog({ open: true, entry, classEntry });
  }, []);

  const handleEditClick = useCallback((entry: MyEntry) => {
    setEditDialog({ open: true, entry });
  }, []);

  const handleReceiptClick = useCallback((entry: MyEntry) => {
    setReceiptDialog({ open: true, entry });
  }, []);

  React.useEffect(() => {
    const keys = new Set<string>();
    // Build the model per dog, not per order — the result card needs the
    // owning dog's identity, and an order can span several dogs.
    for (const entry of entries) {
      for (const dog of entry.dogs) {
        const dogView = toDogEntryView(entry, dog);
        for (const cls of dog.classes) {
          const model = buildResultCardModel({
            entry: dogView,
            classEntry: cls,
            visibility: buildResultCardVisibility(cls),
          });
          if (model && hasSeenResultReveal(model.releaseKey)) keys.add(model.releaseKey);
        }
      }
    }
    setSeenResultReleaseKeys(keys);
  }, [entries]);

  React.useEffect(() => {
    const resultEntryId = searchParams.get('resultEntryId');
    if (!resultEntryId || resultRevealModel) return;

    outer: for (const entry of entries) {
      for (const dog of entry.dogs) {
        const classEntry = dog.classes.find(cls => cls.id === resultEntryId);
        if (!classEntry) continue;
        const model = buildResultCardModel({
          entry: toDogEntryView(entry, dog),
          classEntry,
          visibility: buildResultCardVisibility(classEntry),
        });
        if (model) {
          setResultRevealModel(model);
          const next = new URLSearchParams(searchParams);
          next.delete('resultEntryId');
          setSearchParams(next, { replace: true });
        }
        break outer;
      }
    }
  }, [entries, resultRevealModel, searchParams, setSearchParams]);

  // INTENT: a rejection here must reach CheckInStatusDialog. The dialog awaits
  // this handler and treats "resolved" as "saved" — it closes itself and only
  // renders its error Alert when the promise rejects. Swallowing the throw made
  // a failed check-in indistinguishable from a successful one: the dialog shut
  // cleanly while `updateEntryCheckIn` reverted the optimistic status, so an
  // exhibitor walked away believing their dog was checked in. Do not reintroduce
  // a catch here; the hook logs and rethrows precisely so this caller can let
  // the failure surface where the exhibitor took the action.
  const handleCheckInStatusUpdate = async (status: CheckInStatus, notes?: string) => {
    if (!checkInDialog.entry || !checkInDialog.classEntry) return;

    await updateEntryCheckIn(checkInDialog.entry.id, checkInDialog.classEntry.id, status, notes);
    setCheckInDialog({ open: false, entry: null, classEntry: null });
  };

  const handleResultRevealSeen = useCallback((releaseKey: string) => {
    markResultRevealSeen(releaseKey);
    setSeenResultReleaseKeys(prev => {
      if (prev.has(releaseKey)) return prev;
      const next = new Set(prev);
      next.add(releaseKey);
      return next;
    });
  }, []);

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
            {entries.length === 0 ? (
              <FirstRunZeroState hasDogs={hasDogs} onAddDog={() => setAddDogOpen(true)} />
            ) : (
              <>
                <CompactStatsRow
                  acceptedEntries={entryStats.currentAcceptedEntries}
                  pendingEntries={entryStats.currentPendingEntries}
                  upcomingShows={entryStats.upcomingShows}
                  completedShows={entryStats.completedShows}
                  currentFees={entryStats.currentFees}
                  amountDue={entryStats.currentAmountDue}
                  currentFeesHref={currentFeesHref}
                  onNavigate={navigate}
                />

                {/* order-2 on mobile pushes the dog strip below the entries section
                  (which is order-1). On desktop both are order-0, so source order
                  keeps the dog strip above the entries. */}
                <div className="max-[720px]:order-2">
                  <DogStrip
                    dogs={
                      (dogs ?? []) as {
                        id: string;
                        call_name?: string;
                        name?: string;
                        registrations?: {
                          breed?: string;
                          organization?: string;
                          status?: string;
                        }[];
                      }[]
                    }
                    upcomingClassCountByDog={upcomingClassCountByDog}
                    onAddDog={() => setAddDogOpen(true)}
                  />
                </div>

                {/* Entries section — order-1 on mobile lifts the schedule above the dog
                  strip. Label + tabs move as one unit; space-y-8 preserves the prior
                  spacing between them. */}
                <div className="space-y-8 max-[720px]:order-1">
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
                    <span
                      aria-hidden="true"
                      className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium w-5 h-5"
                    >
                      {entries.length}
                    </span>
                    <span className="normal-case tracking-normal font-normal text-muted-foreground">
                      {ALL_ENTRIES_SCOPE_NOTE}
                    </span>
                  </h2>

                  {/* Inbound scope from My Payments' Receipt link. Sits above
                    the tabs, not inside a tab panel: it describes the whole
                    list the tabs are filtering, and it must stay on screen
                    when the exhibitor switches tabs. */}
                  <EntryScopeBanner
                    scopeMatch={scopeMatch}
                    totalCount={entries.length}
                    onClearScope={clearScope}
                  />

                  {/* Entries List */}
                  <PrimaryTabs
                    tabs={entryTabs}
                    value={selectedTab}
                    onValueChange={value => setSelectedTab(value as EntryTabFilter)}
                    className="space-y-6"
                  >
                    <EntryStatusFilterChips
                      selectedStatus={selectedStatus}
                      onSelectStatus={setSelectedStatus}
                      statusCounts={statusCounts}
                    />
                    <TabsContent value={selectedTab} className="space-y-4">
                      {/* Switching tabs changes the list silently for a screen
                        reader — the visible count sits up in the tab strip that
                        was just left. Announce what the new filter produced. */}
                      <p className="sr-only" role="status" aria-live="polite">
                        {filteredEntries.length === 1
                          ? '1 entry'
                          : `${filteredEntries.length} entries`}
                      </p>
                      {filteredEntries.length === 0 ? (
                        <EntriesEmptyState
                          selectedTab={selectedTab}
                          selectedStatus={selectedStatus}
                          onSwitchTab={setSelectedTab}
                        />
                      ) : (
                        // A real list, so assistive tech announces "list, N
                        // items" and offers list navigation. This was a bare
                        // stack of divs. `space-y-4` stays on the TabsContent,
                        // so spacing is unchanged.
                        <ul className="space-y-4">
                          {filteredEntries.map(entry => (
                            <li key={entry.id}>
                              <MyEntryCard
                                entry={entry}
                                selfCheckinByClassId={selfCheckinByClassId}
                                onCheckInClick={handleCheckInClick}
                                onEditClick={handleEditClick}
                                onReceiptClick={handleReceiptClick}
                                onResultRevealClick={setResultRevealModel}
                                seenResultReleaseKeys={seenResultReleaseKeys}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TabsContent>
                  </PrimaryTabs>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Wait List Queue */}
        {(waitlistLoading || waitlistEntries.length > 0) && (
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
        )}
      </div>
    );
  };

  return (
    <>
      {renderBody()}

      <MyEntriesDialogGroup
        user={user}
        checkInDialog={checkInDialog}
        onCloseCheckIn={() => setCheckInDialog({ open: false, entry: null, classEntry: null })}
        onUpdateCheckInStatus={handleCheckInStatusUpdate}
        editDialog={editDialog}
        onCloseEdit={() => setEditDialog({ open: false, entry: null })}
        onEntryUpdated={async () => {
          await refreshEntries();
          setEditDialog({ open: false, entry: null });
        }}
        receiptDialog={receiptDialog}
        onCloseReceipt={() => setReceiptDialog({ open: false, entry: null })}
        resultRevealModel={resultRevealModel}
        onCloseResultReveal={() => setResultRevealModel(null)}
        onResultRevealSeen={handleResultRevealSeen}
        addDogOpen={addDogOpen}
        onCloseAddDog={() => setAddDogOpen(false)}
        currentUserPersonId={currentUserPersonId ?? undefined}
      />
    </>
  );
};

export default MyEntriesPage;
