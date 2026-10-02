import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import type { Show } from '@/types/show-types';
import {
  Search,
  Calendar,
  Plus,
  Users,
  Download,
  Settings,
  FileText,
  BarChart3,
} from 'lucide-react';
import { EntryClosedNotice } from '@/components/shows/browse/EntryClosedNotice';
import { ShowCalendar } from '@/components/common/LazyComponents';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import '@/styles/myk9-show-details.css';

import {
  ShowsPageSkeleton,
  TabContentSkeleton,
  ShowCalendarSkeleton,
} from '@/components/common/SkeletonLoaders';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { canManageShowSurface, filterManagedShows, managedClubIds } from '@/utils/roleScopes';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import {
  ListEmptyState,
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  ListViewToggle,
} from '@/components/list-toolkit';
import { useViewPreference } from '@/hooks/useViewPreference';
import { ErrorState } from '@/components/common/ErrorState';

// Extracted hooks and components
import { useAuthContext } from '@/hooks/useAuthContext';
import { getTabsForUser, filterShowsForTab } from '@/utils/unified-shows-config';
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import { useBrowseShowsData } from '@/hooks/useBrowseShowsData';
import { ShowCardGrid, ShowsTableView, ShowBulkActionsBar } from '@/components/shows/browse';
import { MonthScrubber } from '@/components/shows/browse/MonthScrubber';
import { ShowLocationField } from '@/components/shows/browse/ShowLocationField';
import { ShowsMapPanel } from '@/components/shows/browse/ShowsMapPanel';
import { useViewerLocation } from '@/features/location/useViewerLocation';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { getBrowseShowsCountUserId, getBrowseShowsTabCount } from '@/utils/browseShowsUtils';
import { VIEW_MODES, VIEW_MODE_KEYS, parseViewMode, type ViewMode } from './browseShowsViewModes';
import { getDefaultViewMode, SHOWS_OFFLINE, SHOWS_UNAVAILABLE } from './browseShowsPage.helpers';
import { buildShowBrowseFilterFields } from './showBrowseFilterFields';
import { activeManagingViewId, buildManagingViews, managingViewFilters } from './showManagingViews';

const SHOW_NOUN = ['show', 'shows'] as const;

const BrowseShowsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userWithRoles: authUser, isSecretary, isAdmin, hasRole } = useAuthContext();
  const canManageShow = useCallback(
    (show: Pick<Show, 'id' | 'clubId'>) =>
      canManageShowSurface({
        isSecretary,
        isAdmin,
        hasRole,
        userWithRoles: authUser,
        clubId: show.clubId ?? undefined,
      }),
    [authUser, hasRole, isAdmin, isSecretary]
  );

  // Where the visitor is, for the Near field, the miles label and the Distance
  // chip. Resolved from a device choice, the profile, or the connection; never
  // a permission prompt on load (MYK9-427 PR 2).
  const viewer = useViewerLocation(authUser?.databaseUserId);
  const origin = viewer.location;

  // Compute allowed tabs from user roles (needed before useUrlTab)
  const tabConfig = useMemo(() => getTabsForUser(authUser), [authUser]);
  const allowedTabIds = useMemo(() => tabConfig.tabs.map(t => t.id), [tabConfig.tabs]);
  const [selectedTab, setSelectedTab] = useUrlTab(allowedTabIds, tabConfig.defaultTab);
  // Bulk selection and the Managing views only ever apply on the secretary/
  // admin's own-shows tab — every other tab is public or exhibitor-facing
  // (MYK9-798: "Public pages: no bulk bar").
  const isManagingTab = selectedTab === 'managing';

  // Her own choice is remembered (MYK9-929, M9), Find Shows and Managing apart since their
  // defaults differ. A shared `?view=` link still wins for the visit that opened it.
  const [storedViewMode, setStoredViewMode] = useViewPreference<ViewMode>(
    isManagingTab ? 'shows-managing' : 'shows-find',
    getDefaultViewMode(selectedTab),
    VIEW_MODE_KEYS
  );
  const viewMode = parseViewMode(searchParams.get('view')) ?? storedViewMode;
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [isViewModeChanging, setIsViewModeChanging] = useState(false);

  // Initial data load — filteredShows starts empty, populated after filter hook runs
  const [filteredShowsState, setFilteredShowsState] = useState<Show[]>([]);

  // Single data hook call — uses filteredShows for enhancement
  const {
    user,
    isLoading,
    hasError,
    showsOffline,
    shows,
    entries,
    enhancedShows: allEnhancedShows,
    userContext,
    tabQuickActions,
    handleRetry,
  } = useBrowseShowsData({ filteredShows: filteredShowsState, selectedTab });

  // Use extracted filter hook
  const {
    filters,
    setFilters,
    filteredShows,
    monthScopedShows,
    hasActiveFilters,
    clearAllFilters,
  } = useBrowseShowsFilters({ shows, entries, userContext, selectedTab, origin });

  // Sync filtered shows into state for the data hook (avoids second hook call)
  useEffect(() => {
    setFilteredShowsState(filteredShows);
  }, [filteredShows]);

  // Build club filter options from available shows
  const clubFilterOptions = useMemo(() => {
    const clubMap = new Map<string, string>();
    shows.forEach(show => {
      if (show.clubId && show.clubName) {
        clubMap.set(show.clubId, show.clubName);
      }
    });
    return [...clubMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ label: name, value: id }));
  }, [shows]);

  const filterFields = useMemo(
    () =>
      buildShowBrowseFilterFields({
        filters,
        onFiltersChange: setFilters,
        clubOptions: clubFilterOptions,
        hasLocation: origin !== null,
      }),
    [filters, setFilters, clubFilterOptions, origin]
  );

  // The tab's own total, before search/discipline/club/radius/status narrow it
  // further — what the result line's "of N" names (list-toolkit, MYK9-798).
  const tabShows = useMemo(
    () => filterShowsForTab(selectedTab, shows, entries, userContext),
    [selectedTab, shows, entries, userContext]
  );

  const handleMonthChange = useCallback(
    (month: string) => setFilters(prev => ({ ...prev, month })),
    [setFilters]
  );

  const enhancedShows = allEnhancedShows;
  const countUserId = useMemo(() => getBrowseShowsCountUserId(user), [user]);

  // Bulk selection for shows
  const getShowId = useCallback((show: { id: string }) => show.id, []);
  const manageableShows = useMemo(
    () => filterManagedShows(enhancedShows, managedClubIds({ isAdmin, userWithRoles: authUser })),
    [authUser, enhancedShows, isAdmin]
  );
  const bulkSelection = useBulkSelection({
    items: manageableShows,
    getItemId: getShowId,
    // Search/discipline/club/month/radius narrow `manageableShows` (the
    // currently-visible rows) without changing `resetKey` below, so a show
    // selected then filtered out must drop out of the selection too —
    // otherwise it stays selected invisibly and can resurface selected when
    // the filter clears (Codex P2 on PR #2566).
    pruneToItems: true,
    // A tab switch or a Managing-view change is a new "what am I looking at",
    // so a stale selection never rides along and becomes bulk-editable under
    // a filter that no longer describes it (Design Decision 4).
    resetKey: `${selectedTab}:${filters.status}`,
  });

  // Managing tab's built-in views (list-toolkit, MYK9-798) — counted over the
  // manager's own shows for this tab BEFORE `filters.status` narrows them
  // (from `tabShows`, not `manageableShows`/`enhancedShows`: those already
  // have the selected view applied via `filteredShows` → `useBrowseShowsData`,
  // which made every view's count read as the CURRENTLY selected view's count
  // — Codex P2). Search/discipline/club/radius narrow WITHIN a view, same as
  // the Users roster's views; they do not change what a view's own count is.
  const managingTabShows = useMemo(
    () => filterManagedShows(tabShows, managedClubIds({ isAdmin, userWithRoles: authUser })),
    [authUser, isAdmin, tabShows]
  );
  const managingViews = useMemo(
    () => buildManagingViews(managingTabShows, entries),
    [managingTabShows, entries]
  );

  const handleBulkComplete = useCallback(() => {
    bulkSelection.clearSelection();
    handleRetry(); // Refresh data after bulk action
  }, [bulkSelection, handleRetry]);

  // Real-time updates
  useRealTimeUpdates();

  useEffect(() => {
    if (!isTabSwitching) return undefined;

    const timeoutId = setTimeout(() => setIsTabSwitching(false), 300);
    return () => clearTimeout(timeoutId);
  }, [isTabSwitching, selectedTab]);

  useEffect(() => {
    if (!isViewModeChanging) return undefined;

    const timeoutId = setTimeout(() => setIsViewModeChanging(false), 200);
    return () => clearTimeout(timeoutId);
  }, [isViewModeChanging, viewMode]);

  // Handle tab change with permission check and loading state
  const handleTabChange = useCallback(
    (newTab: string) => {
      if (newTab === selectedTab) return;

      if (!ShowPermissionValidator.canAccessTab(user, newTab)) {
        logger.warn(`Access denied to tab: ${newTab}`, 'shows', { tab: newTab, userId: user?.id });
        return;
      }

      setIsTabSwitching(true);
      setSelectedTab(newTab);
    },
    [selectedTab, setSelectedTab, user]
  );

  // Handle a view change: remember it, and drop a `?view=` link's override so the choice sticks.
  const handleViewModeChange = useCallback(
    (key: string) => {
      const newViewMode = parseViewMode(key);
      if (!newViewMode || newViewMode === viewMode) return;

      setIsViewModeChanging(true);
      setStoredViewMode(newViewMode);
      if (searchParams.has('view')) {
        setSearchParams(
          prev => {
            const next = new URLSearchParams(prev);
            next.delete('view');
            return next;
          },
          { replace: true }
        );
      }
    },
    [searchParams, setSearchParams, setStoredViewMode, viewMode]
  );

  // Breadcrumb items for PageHeader
  const breadcrumbs = useMemo(() => {
    // 'Find Shows', matching the sidebar entry and the page title. All three
    // named the same destination differently before F6.
    const items = [{ label: 'Find Shows', href: '/shows', onClick: () => handleTabChange('all') }];

    if (selectedTab !== 'all') {
      const currentTab = tabConfig.tabs.find(tab => tab.id === selectedTab);
      if (currentTab) {
        items.push({ label: currentTab.label, href: '#', onClick: () => {} });
      }
    }

    return items;
  }, [selectedTab, tabConfig.tabs, handleTabChange]);

  // Quick action buttons for PageHeader
  const actionButtons = useMemo(
    () => (
      <div className="flex flex-wrap gap-2">
        {tabQuickActions.map(action => {
          const IconComponent =
            { Plus, Users, Search, Download, Settings, BarChart3, Calendar, FileText }[
              action.icon
            ] || Plus;
          return action.permission ? (
            <PermissionGuard key={action.id} permission={action.permission}>
              <Button
                variant={action.variant}
                size="default"
                onClick={() => action.onClick({} as Show)}
              >
                <IconComponent className="h-4 w-4 mr-2" />
                <span>{action.label}</span>
              </Button>
            </PermissionGuard>
          ) : (
            <Button
              key={action.id}
              variant={action.variant}
              size="default"
              onClick={() => action.onClick({} as Show)}
            >
              <IconComponent className="h-4 w-4 mr-2" />
              <span>{action.label}</span>
            </Button>
          );
        })}
      </div>
    ),
    [tabQuickActions]
  );

  // Audit page access
  useEffect(() => {
    auditService.log({
      action: AuditAction.READ,
      entityType: 'browse_shows',
      entityId: user?.id || 'anonymous',
      metadata: {
        page: 'browse_shows',
        loadTime: new Date().toISOString(),
        userRoles: user?.roles || [],
        accessibleTabs: ShowPermissionValidator.getAccessibleTabs(user),
      },
    });
  }, [user]);

  // Map ShowTab[] → PrimaryTabDef[] with computed counts
  const tabDefs: PrimaryTabDef[] = useMemo(
    () =>
      tabConfig.tabs.map(tab => {
        const def: PrimaryTabDef = { id: tab.id, label: tab.label };
        if (tab.icon) def.icon = tab.icon;
        // The active tab badge mirrors the enhanced list the user is looking at.
        // Inactive tab badges advertise tab totals.
        const count =
          tab.id === selectedTab
            ? enhancedShows.length
            : getBrowseShowsTabCount({
                tab,
                shows,
                entries,
                userId: countUserId,
              });
        if (count !== undefined) def.count = count;
        return def;
      }),
    [countUserId, enhancedShows.length, entries, selectedTab, shows, tabConfig.tabs]
  );

  // Render shows in different view modes
  const renderShowsView = () => {
    if (enhancedShows.length === 0 && viewMode !== 'map') {
      return (
        <ListEmptyState
          icon={Search}
          noun={SHOW_NOUN}
          filtered={hasActiveFilters}
          onShowAll={clearAllFilters}
          description="Shows will appear here as they are added. Try searching by discipline or club name above."
          action={null}
        />
      );
    }

    switch (viewMode) {
      case 'calendar':
        return (
          <div className="mt-4">
            <Suspense fallback={<ShowCalendarSkeleton />}>
              <ShowCalendar
                onShowRegister={showId => logger.debug('Register for show', 'shows', { showId })}
                shows={enhancedShows}
              />
            </Suspense>
          </div>
        );

      case 'map':
        return (
          <ShowsMapPanel
            shows={enhancedShows}
            onSwitchToCards={() => handleViewModeChange('cards')}
          />
        );

      case 'table':
        return (
          <ShowsTableView
            shows={enhancedShows}
            canManageShow={canManageShow}
            // Selection (and the floating bulk bar) is Managing-only — a
            // public/exhibitor tab never offers a bulk bar (MYK9-798).
            {...(isManagingTab
              ? { isSelected: bulkSelection.isSelected, onToggleSelect: bulkSelection.toggleItem }
              : {})}
          />
        );

      case 'cards':
      default:
        return (
          <ShowCardGrid
            shows={enhancedShows}
            canManageShow={canManageShow}
            entries={entries}
            selectedTab={selectedTab}
            user={user}
            origin={origin}
            {...(isManagingTab
              ? { isSelected: bulkSelection.isSelected, onToggleSelect: bulkSelection.toggleItem }
              : {})}
          />
        );
    }
  };

  return (
    <PageShell>
      {/* Loading state */}
      {isLoading && shows.length === 0 && <ShowsPageSkeleton viewMode={viewMode} count={6} />}

      {/* Error state */}
      {hasError && !isLoading && (
        <ErrorState
          message={showsOffline ? SHOWS_OFFLINE : SHOWS_UNAVAILABLE}
          onRetry={handleRetry}
        />
      )}

      {/* Normal content */}
      {!isLoading && !hasError && (
        <>
          {/* "Find Shows", matching the sidebar entry that leads here (F6). The page
            said "Shows" while the sidebar said "Find Shows", so the two named the
            same destination differently — and with the "Entered as exhibitor" tab
            gone this page is unambiguously about finding, not about what you
            already entered. */}
          <PageHeader
            breadcrumbs={breadcrumbs}
            title="Find Shows"
            actions={actionButtons}
            showTitle
          />

          <div className="flex flex-col gap-3">
            {isManagingTab && managingViews.length > 0 && (
              <ListViewTabs
                label="Show views"
                views={managingViews}
                activeId={activeManagingViewId(filters.status)}
                onSelect={id => setFilters(prev => ({ ...prev, status: managingViewFilters(id) }))}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ListFilterBar
                searchValue={filters.search}
                onSearchChange={value => setFilters(prev => ({ ...prev, search: value }))}
                searchPlaceholder="Search shows or locations"
                fields={filterFields}
                className="flex-1"
              />
              <ShowLocationField
                location={viewer.location}
                isResolvingLocation={viewer.isResolving}
                onChooseTyped={viewer.chooseTyped}
                onUseDeviceLocation={viewer.useDeviceLocation}
                onChooseAnywhere={viewer.chooseAnywhere}
              />
            </div>
            <ListResultLine
              shown={allEnhancedShows.length}
              total={tabShows.length}
              noun={SHOW_NOUN}
              filtered={hasActiveFilters}
              onShowAll={clearAllFilters}
              {...(isManagingTab
                ? {
                    selectAll: {
                      selectedCount: bulkSelection.selectedCount,
                      onSelectAll: bulkSelection.selectAll,
                    },
                  }
                : {})}
            >
              <ListViewToggle
                modes={VIEW_MODES}
                active={viewMode}
                onChange={handleViewModeChange}
              />
            </ListResultLine>
          </div>

          {/* Floating bulk bar — Managing tab only (MYK9-798) */}
          {isManagingTab && (
            <ShowBulkActionsBar
              selectedShows={bulkSelection.selectedItems}
              onClearSelection={bulkSelection.clearSelection}
              onBulkComplete={handleBulkComplete}
            />
          )}

          {/* Month scrubber — counts reflect every filter except the month, so
              the tiles answer "when?" for the list the visitor is looking at. */}
          <MonthScrubber
            shows={monthScopedShows}
            value={filters.month}
            onChange={handleMonthChange}
          />

          {/* Tabs — hidden for guests and exhibitors, who only have Browse All */}
          <PrimaryTabs
            tabs={tabDefs}
            value={selectedTab}
            onValueChange={handleTabChange}
            hideWhenSingle
          >
            <TabsContent value={selectedTab}>
              {isTabSwitching || isViewModeChanging ? (
                <TabContentSkeleton viewMode={viewMode} count={4} />
              ) : (
                <>
                  <EntryClosedNotice shows={enhancedShows} selectedTab={selectedTab} />
                  {renderShowsView()}
                </>
              )}
            </TabsContent>
          </PrimaryTabs>
        </>
      )}
    </PageShell>
  );
};

export default BrowseShowsPage;
