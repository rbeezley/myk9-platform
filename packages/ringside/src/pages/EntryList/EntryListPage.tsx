/**
 * EntryListPage — single-class entry list, ringside-side.
 *
 * Moved into @myk9/ringside in PR E2d-2b. This component is a pure
 * controlled render of `EntryListPageProps` — it owns NO useState,
 * NO useRef, NO useEffect of its own (beyond trivial useMemo for
 * render derivations), and calls NO host-coupled hooks.
 *
 * The shim at `apps/myk9q/src/pages/EntryList/EntryList.tsx` owns:
 *  - auth, permission, routing
 *  - all 19 useState slots
 *  - `useEntryListData`, `useEntryListActions`, `useEntryListHandlers`,
 *    `useEntryListEffects` (all host-coupled hooks)
 *  - `useEntryListFilters`, `useDragAndDropEntries` (pure ringside
 *    hooks — called shim-side so the resulting filter setters are
 *    available to `useEntryListHandlers` as deps; see Path A
 *    architecture note in `pageProps.ts`)
 *  - all 10 dialog implementations + 10 UI primitives as slot bags
 *
 * The shim renders `<EntryListPage {...all-the-bags} />` and that's it.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabBar } from '@myk9/ui';
import type { EntryListPageProps } from './pageProps';
import { useEntryListPageActions } from './hooks/useEntryListPageActions';
import type { TabType } from './hooks/useEntryListFilters';
import {
  buildSectionTabs,
  buildSortOptions,
  buildStatusTabs,
  defaultSortOrder,
} from './entryListTabs';
import {
  EntryListHeader,
  EntryListContent,
  ClassCompletionPresentation,
  EntryListDialogs,
  EntryListEmptyState,
  EntryListSkeleton,
  SuccessToast,
  FloatingDoneButton,
} from './components';

export const EntryListPage: React.FC<EntryListPageProps> = ({
  classId,
  data,
  dataStatus,
  handlers,
  actions,
  uiState,
  uiActions,
  derived,
  favorites,
  ownership,
  drag,
  dialogs,
  layout,
  combined,
  context,
}) => {
  const navigate = useNavigate();
  const isCombined = Boolean(combined);
  const { entries, classInfo } = data;
  const { isRefreshing, fetchError, refresh } = dataStatus;
  const { showContext, hasPermission, role } = context;
  const {
    localEntries,
    activeStatusPopup,
    isManualRefreshing,
    isLoaded,
    hasCompletedInitialLoad,
    isDragMode,
    runOrderDialogOpen,
    classOptionsDialogOpen,
    requirementsDialogOpen,
    maxTimeDialogOpen,
    maxTimeRequiredWarning,
    settingsDialogOpen,
    noStatsDialogOpen,
    statusDialogOpen,
    selfCheckinDisabledDialog,
    showSuccessMessage,
    isFilterPanelOpen,
    isRecalculatingPlacements,
    printDialogType,
    activeResetMenu,
    resetMenuPosition,
    resetConfirmDialog,
    areaCountDialogOpen,
    areaCountRequirements,
  } = uiState;
  const {
    setActiveStatusPopup,
    setRunOrderDialogOpen,
    setClassOptionsDialogOpen,
    setRequirementsDialogOpen,
    setMaxTimeDialogOpen,
    setSettingsDialogOpen,
    setStatusDialogOpen,
    setNoStatsDialogOpen,
    setSelfCheckinDisabledDialog,
    setMaxTimeRequiredWarning,
    setAreaCountDialogOpen,
    setIsFilterPanelOpen,
    setIsDragMode,
    setPrintDialogType,
    setActiveTab,
    setSortOrder,
  } = uiActions;
  const {
    activeTab,
    sortOrder,
    searchTerm,
    filteredEntries,
    completedEntries,
    notRunningEntries,
    currentEntries,
    entryCounts,
  } = derived;
  const { sensors, handleDragStart, handleDragEnd } = drag;
  const { isSyncing, hasError } = actions;

  const { handlePrintSortOrder, handleOpenDragMode, handleApplyRunOrder } = useEntryListPageActions(
    { handlers, uiActions, printDialogType, currentEntries }
  );

  const statusTabs = useMemo(
    () =>
      buildStatusTabs(
        { pending: entryCounts.pending, completed: entryCounts.completed },
        // Three sources, in order of how well each can promise that the badge
        // describes the ROWS under it (MYK9-645):
        //   1. a per-entry classification -- `entryCounts` is then the host's
        //      rule applied to the very rows this page renders, so the two
        //      cannot drift even mid-write, and the aggregate is not consulted;
        //   2. an aggregate `statusCounts`, for a host that computes the pair
        //      but not the per-row grouping;
        //   3. the entries-array `isScored` split, for consumers supplying
        //      neither.
        classInfo?.entryClassification ? undefined : classInfo?.statusCounts
      ),
    [
      entryCounts.pending,
      entryCounts.completed,
      classInfo?.statusCounts,
      classInfo?.entryClassification,
    ]
  );

  const sectionTabs = useMemo(
    () => (isCombined ? buildSectionTabs(entries) : []),
    [isCombined, entries]
  );

  const sortOptions = useMemo(
    () => buildSortOptions(activeTab, isCombined),
    [activeTab, isCombined]
  );

  const hasActiveFilters = searchTerm.length > 0 || sortOrder !== defaultSortOrder(isCombined);

  const completionKey = combined ? `${combined.classIds.a}+${combined.classIds.b}` : classId;

  // Loading state.
  // Gate on LOAD COMPLETION, not emptiness. `!entries.length` -- the test the
  // combined page used -- meant a class that genuinely has no entries shimmered
  // forever, and a partially-arrived list read as complete the moment one entry
  // landed.
  if (!hasCompletedInitialLoad && !fetchError) {
    return (
      <EntryListSkeleton
        showSectionTabs={isCombined}
        {...(isCombined ? { label: 'Loading combined entries' } : {})}
      />
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="p-3">
        <layout.ErrorState
          message={`Failed to load entries: ${fetchError.message || 'Please check your connection and try again.'}`}
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      </div>
    );
  }

  // Empty state - the class(es) exist but have no entries
  if (hasCompletedInitialLoad && entries.length === 0) {
    return (
      <EntryListEmptyState
        className={classInfo?.className}
        description={
          isCombined
            ? 'Neither section has entries yet. They will appear here once they are registered.'
            : "This class doesn't have any entries yet. Entries will appear once they are registered."
        }
        onGoBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className={`p-3${isLoaded ? ' loaded' : ''}`} data-loaded={isLoaded}>
      <EntryListHeader
        classInfo={classInfo}
        isRefreshing={isRefreshing || isManualRefreshing}
        isSyncing={isSyncing}
        hasError={hasError}
        pendingCount={actions.pendingCount}
        hasActiveFilters={hasActiveFilters}
        onFilterClick={() => setIsFilterPanelOpen(true)}
        onRefresh={handlers.handleManualRefresh}
        refreshLongPressHandlers={handlers.refreshLongPressHandlers}
        showSectionsBadge={isCombined}
        actionsMenu={{
          showRunOrder: hasPermission('canChangeRunOrder'),
          // Both act on ONE class. A combined A/B view has two, so there is no
          // unambiguous target -- offering them would make the steward guess
          // which section they were about to renumber or reconfigure.
          showRecalculatePlacements: !isCombined && hasPermission('canManageClasses'),
          showClassSettings: !isCombined && hasPermission('canManageClasses'),
          showPrintOptions: Boolean(role && role !== 'exhibitor') && !context.hidePrintOptions,
          isRecalculatingPlacements,
          onRunOrderClick: () => setRunOrderDialogOpen(true),
          onRecalculatePlacements: handlers.handleRecalculatePlacements,
          onClassSettingsClick: () => setClassOptionsDialogOpen(true),
          printOptions: [
            {
              label: 'Check-In Sheet',
              onClick: () => setPrintDialogType('check-in'),
              icon: 'checkin',
            },
            {
              label: 'Results Sheet',
              onClick: () => setPrintDialogType('results'),
              icon: 'results',
              disabled: completedEntries.length === 0,
            },
            {
              label: 'Scoresheet',
              onClick: () => setPrintDialogType('scoresheet'),
              icon: 'scoresheet',
            },
          ],
        }}
        HamburgerMenu={layout.HamburgerMenu}
        CompactOfflineIndicator={layout.CompactOfflineIndicator}
        SyncIndicator={layout.SyncIndicator}
        RefreshIndicator={layout.RefreshIndicator}
        FilterTriggerButton={layout.FilterTriggerButton}
        ClassDetailsPopover={layout.ClassDetailsPopover}
      />

      {combined && (
        <TabBar
          tabs={sectionTabs}
          activeTab={combined.sectionFilter}
          onTabChange={tabId => combined.setSectionFilter(tabId as 'all' | 'A' | 'B')}
          className="full-width"
        />
      )}

      <TabBar
        tabs={statusTabs}
        activeTab={activeTab}
        onTabChange={tabId => setActiveTab(tabId as TabType)}
      />

      <layout.PullToRefresh onRefresh={() => refresh(true)} enabled={false} threshold={80}>
        <div className="isolate">
          <div className="pb-8 pt-2">
            {/* `classId` here is ONLY the celebration claim key -- it decides
                which celebration fires once, not whether one should. Readiness
                is `isScoringFinalized && resultsReleasedAt` off `classInfo`,
                so the combined route's "both sections done" rule is enforced
                where that `classInfo` is BUILT (`fetchCombinedClasses` ANDs the
                two class rows), not here. Getting that backwards is how the
                first cut of this collapse would have celebrated the pair the
                moment section A was released.

                One celebration for the pair -- the counts and elapsed time are
                genuinely pair-level -- but a podium PER SECTION: A and B are
                placed independently, so a merged podium would show two 1sts,
                two 2nds, and a ranking nobody competed in.

                The combined route had no completion view at all before the
                MYK9-260 collapse. */}
            <ClassCompletionPresentation
              key={completionKey}
              classId={completionKey}
              {...(isCombined ? { podiumSections: ['A', 'B'] } : {})}
              classInfo={classInfo}
              entries={localEntries}
              activeTab={activeTab}
              onSelectCompleted={() => setActiveTab('completed')}
            />
            <EntryListContent
              entries={currentEntries}
              activeTab={activeTab}
              isDragMode={isDragMode}
              showContext={showContext}
              classInfo={classInfo}
              hasPermission={hasPermission}
              onEntryClick={handlers.handleEntryClick}
              onStatusClick={handlers.handleStatusClick}
              onResetMenuClick={handlers.handleResetMenuClick}
              onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
              onPrefetch={handlers.handleEntryPrefetch}
              showSectionBadges={isCombined}
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onOpenDragMode={handleOpenDragMode}
              {...(favorites ? { favorites } : {})}
              {...(ownership ? { ownership } : {})}
              DogCard={layout.DogCard}
            />
            {/* INTENT: a withdrawn or pulled dog must stay VISIBLE to the judge
                and the gate steward -- "did #114 scratch, or have I just not
                got to her?" is a question the ring asks out loud, and an
                entry that silently disappears is worse than one shown as not
                running. These rows already sorted last (`deprioritizePulled`);
                MYK9-645 makes that a LABELLED, collapsed group rather than a
                silent tail, because the Pending badge no longer counts them
                and a count that disagrees with the rows under it is its own
                bug. Collapsed by default so the judge's thumb still lands on
                the next dog to score. Do not hide this group. */}
            {activeTab === 'pending' && notRunningEntries && notRunningEntries.length > 0 && (
              <section className="mt-6">
                {/* A native <details>: this component owns no useState by
                    contract, and the disclosure needs none. */}
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center border-t border-border pt-3 text-sm font-medium text-muted-foreground">
                    Not running ({notRunningEntries.length})
                  </summary>
                  <div className="pt-3">
                    <EntryListContent
                      entries={notRunningEntries}
                      activeTab={activeTab}
                      // No Score button, no scoresheet tap, no reset menu: a
                      // score saved from inside a collapsed group would move
                      // neither badge and the judge would never see it again.
                      // The status chip stays, so the existing check-in flow is
                      // still the way back (MYK9-645).
                      scoringDisabled
                      isDragMode={false}
                      showContext={showContext}
                      classInfo={classInfo}
                      hasPermission={hasPermission}
                      onEntryClick={handlers.handleEntryClick}
                      onStatusClick={handlers.handleStatusClick}
                      onResetMenuClick={handlers.handleResetMenuClick}
                      onSelfCheckinDisabled={() => setSelfCheckinDisabledDialog(true)}
                      onPrefetch={handlers.handleEntryPrefetch}
                      showSectionBadges={isCombined}
                      sensors={sensors}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      {...(favorites ? { favorites } : {})}
                      {...(ownership ? { ownership } : {})}
                      DogCard={layout.DogCard}
                    />
                  </div>
                </details>
              </section>
            )}
          </div>
        </div>
      </layout.PullToRefresh>

      <layout.FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={uiActions.setSearchTerm}
        searchPlaceholder="Search dog, handler, breed, armband..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={order => {
          setSortOrder(order as 'run' | 'armband' | 'placement' | 'manual');
          setIsDragMode(false);
        }}
        resultsLabel={
          searchTerm
            ? `${filteredEntries.length} of ${localEntries.length} entries`
            : `${currentEntries.length} entries`
        }
      />

      <EntryListDialogs
        classId={classId}
        classInfo={classInfo}
        localEntries={localEntries}
        hasPermission={hasPermission}
        hideMaxTimeOption={context.hideMaxTimeOption}
        hideSettingsOption={context.hideSettingsOption}
        activeStatusPopup={activeStatusPopup}
        setActiveStatusPopup={setActiveStatusPopup}
        handleStatusChange={handlers.handleStatusChange}
        runOrderDialogOpen={runOrderDialogOpen}
        setRunOrderDialogOpen={setRunOrderDialogOpen}
        handleApplyRunOrder={handleApplyRunOrder}
        handleOpenDragMode={handleOpenDragMode}
        classOptionsDialogOpen={classOptionsDialogOpen}
        setClassOptionsDialogOpen={setClassOptionsDialogOpen}
        setRequirementsDialogOpen={setRequirementsDialogOpen}
        setMaxTimeDialogOpen={setMaxTimeDialogOpen}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setStatusDialogOpen={setStatusDialogOpen}
        handleStatisticsClick={handlers.handleStatisticsClick}
        handlePrintCheckIn={() => setPrintDialogType('check-in')}
        handlePrintResults={() => setPrintDialogType('results')}
        handlePrintScoresheet={() => setPrintDialogType('scoresheet')}
        requirementsDialogOpen={requirementsDialogOpen}
        maxTimeDialogOpen={maxTimeDialogOpen}
        maxTimeRequiredWarning={maxTimeRequiredWarning}
        setMaxTimeRequiredWarning={setMaxTimeRequiredWarning}
        refresh={refresh}
        settingsDialogOpen={settingsDialogOpen}
        noStatsDialogOpen={noStatsDialogOpen}
        setNoStatsDialogOpen={setNoStatsDialogOpen}
        statusDialogOpen={statusDialogOpen}
        handleStatusDialogChange={handlers.handleStatusDialogChange}
        areaCountDialogOpen={areaCountDialogOpen}
        setAreaCountDialogOpen={setAreaCountDialogOpen}
        areaCountRequirements={areaCountRequirements}
        activeResetMenu={activeResetMenu}
        resetMenuPosition={resetMenuPosition}
        handleResetScore={handlers.handleResetScore}
        closeResetMenu={handlers.closeResetMenu}
        resetConfirmDialog={resetConfirmDialog}
        confirmResetScore={handlers.confirmResetScore}
        cancelResetScore={handlers.cancelResetScore}
        selfCheckinDisabledDialog={selfCheckinDisabledDialog}
        setSelfCheckinDisabledDialog={setSelfCheckinDisabledDialog}
        CheckinStatusDialog={dialogs.CheckinStatusDialog}
        RunOrderDialog={dialogs.RunOrderDialog}
        ClassOptionsDialog={dialogs.ClassOptionsDialog}
        ClassRequirementsDialog={dialogs.ClassRequirementsDialog}
        MaxTimeDialog={dialogs.MaxTimeDialog}
        ClassSettingsDialog={dialogs.ClassSettingsDialog}
        NoStatsDialog={dialogs.NoStatsDialog}
        ClassStatusDialog={dialogs.ClassStatusDialog}
        AreaCountSelectionDialog={dialogs.AreaCountSelectionDialog}
      />

      <dialogs.ScoresheetPrintDialog
        isOpen={printDialogType !== null}
        onClose={() => setPrintDialogType(null)}
        onPrint={handlePrintSortOrder}
        title={
          printDialogType === 'check-in'
            ? 'Print Check-In Sheet'
            : printDialogType === 'results'
              ? 'Print Results'
              : 'Print Scoresheet'
        }
        options={
          printDialogType === 'results'
            ? {
                primary: { label: 'Placement', sortOrder: 'placement' },
                secondary: { label: 'Armband Number', sortOrder: 'armband' },
              }
            : undefined
        }
      />

      {/* SuccessToast + FloatingDoneButton are leaf components from
          ringside — imported via dialogs subtree's index. Rendered
          here because EntryListDialogs already renders ResetConfirm /
          ResetMenuPopup / SelfCheckinDisabledDialog; keeping the
          toast/done-button render here matches the host's structure
          and avoids stuffing more concerns into EntryListDialogs. */}
      <SuccessToast isVisible={showSuccessMessage} message="Run order updated successfully" />
      <FloatingDoneButton
        isVisible={isDragMode}
        onClick={() => {
          setIsDragMode(false);
          setSortOrder('run');
        }}
      />
    </div>
  );
};

export default EntryListPage;
