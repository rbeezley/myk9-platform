import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
import { ShowCalendar } from '@/components/common/LazyComponents';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import '@/styles/myk9-show-details.css';

import {
  ShowsPageSkeleton,
  TabContentSkeleton,
  ShowCalendarSkeleton,
} from '@/components/common/SkeletonLoaders';
import { ShowPermissionValidator } from '@/utils/permissionValidation';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchBar } from '@/components/common/SearchBar';
import { FilterChips } from '@/components/common/FilterChips';
import type { FilterDefinition as ChipFilterDefinition } from '@/components/common/FilterChips';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ResultsCount } from '@/components/common/ResultsCount';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { MineToggle } from '@/components/common/MineToggle';
import { useMineToggle } from '@/hooks/useMineToggle';

// Extracted hooks and components
import { useAuthContext } from '@/hooks/useAuthContext';
import { getTabsForUser } from '@/utils/unified-shows-config';
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import { useBrowseShowsData } from '@/hooks/useBrowseShowsData';
import { ShowCardGrid, ShowsTableView, ShowBulkActionsBar } from '@/components/shows/browse';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { ViewPicker } from '@/components/common/ViewPicker';

import { useSavedViews, type ViewConfig } from '@/hooks/useSavedViews';

type ViewMode = 'cards' | 'table' | 'calendar';

const VIEW_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' as const },
];

const BrowseShowsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { userWithRoles: authUser, isSecretary, isAdmin } = useAuthContext();
  const canManageShows = isSecretary || isAdmin;

  // Compute allowed tabs from user roles (needed before useUrlTab)
  const tabConfig = useMemo(() => getTabsForUser(authUser), [authUser]);
  const allowedTabIds = useMemo(() => tabConfig.tabs.map(t => t.id), [tabConfig.tabs]);
  const [selectedTab, setSelectedTab] = useUrlTab(allowedTabIds, tabConfig.defaultTab);

  // View mode state (still URL-synced manually — useUrlTab only manages ?tab=)
  const initialViewMode = (searchParams.get('view') as ViewMode) || 'cards';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [isViewModeChanging, setIsViewModeChanging] = useState(false);

  // Initial data load — filteredShows starts empty, populated after filter hook runs
  const [filteredShowsState, setFilteredShowsState] = useState<Show[]>([]);

  // Single data hook call — uses filteredShows for enhancement
  const {
    user,
    isLoading,
    hasError,
    shows,
    entries,
    enhancedShows: allEnhancedShows,
    userContext,
    tabQuickActions,
    handleRetry,
  } = useBrowseShowsData({ filteredShows: filteredShowsState, selectedTab });

  // Use extracted filter hook
  const { filters, setFilters, filteredShows, hasActiveFilters, clearAllFilters } =
    useBrowseShowsFilters({ shows, entries, userContext, selectedTab });

  // Sync filtered shows into state for the data hook (avoids second hook call)
  useEffect(() => {
    setFilteredShowsState(filteredShows);
  }, [filteredShows]);

  // Mine toggle — filter to shows where user has entries
  const { isMine, toggle: toggleMine } = useMineToggle('shows');

  // Saved views
  const {
    views: savedViewsList,
    activeViewId,
    applyView,
    saveView,
    updateView,
    deleteView,
    setDefault,
    clearActiveView,
  } = useSavedViews('shows');
  const getCurrentConfig = useCallback(
    (): ViewConfig => ({ filters: { ...filters }, viewMode, tab: selectedTab }),
    [filters, viewMode, selectedTab]
  );
  const handleApplyView = useCallback(
    (id: string) => {
      applyView(id);
      const view = savedViewsList.find(v => v.id === id);
      if (view) {
        setFilters(prev => ({ ...prev, ...view.config.filters }));
        if (view.config.viewMode) setViewMode(view.config.viewMode as ViewMode);
        if (view.config.tab) setSelectedTab(view.config.tab);
      }
    },
    [savedViewsList, applyView, setFilters, setSelectedTab]
  );

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

  // FilterChips definitions
  const chipFilters: ChipFilterDefinition[] = useMemo(
    () => [
      {
        key: 'discipline',
        label: 'Discipline',
        options: [
          { label: 'Agility', value: 'agility' },
          { label: 'Scent Work', value: 'scent_work' },
          { label: 'Rally', value: 'rally' },
          { label: 'Obedience', value: 'obedience' },
        ],
      },
      {
        key: 'entryStatus',
        label: 'Entry Status',
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Closing Soon', value: 'closing_soon' },
          { label: 'Waitlist', value: 'waitlist' },
          { label: 'Closed', value: 'closed' },
        ],
      },
      {
        key: 'dateRange',
        label: 'Date Range',
        options: [
          { label: 'Upcoming', value: 'upcoming' },
          { label: 'This Month', value: 'this_month' },
          { label: 'Next Month', value: 'next_month' },
        ],
      },
      {
        key: 'club',
        label: 'Club',
        options: clubFilterOptions,
      },
    ],
    [clubFilterOptions]
  );

  // Bridge chip filter values from existing filters state
  const chipFilterValues = useMemo(() => {
    const values: Record<string, string> = {};
    if (filters.discipline !== 'all') values.discipline = filters.discipline;
    if (filters.entryStatus !== 'all') values.entryStatus = filters.entryStatus;
    if (filters.dateRange !== 'all' && filters.dateRange !== 'upcoming')
      values.dateRange = filters.dateRange;
    if (filters.club !== 'all') values.club = filters.club;
    return values;
  }, [filters.discipline, filters.entryStatus, filters.dateRange, filters.club]);

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters(prev => ({ ...prev, [key]: value || 'all' }));
    },
    [setFilters]
  );

  // Apply "mine" filter — when toggled, show only shows where user has entries
  const { enhancedShows, mineCount } = useMemo(() => {
    const mine = allEnhancedShows.filter(s => s.userHasEntries);
    return {
      enhancedShows: isMine ? mine : allEnhancedShows,
      mineCount: mine.length,
    };
  }, [isMine, allEnhancedShows]);

  // Bulk selection for shows
  const getShowId = useCallback((show: { id: string }) => show.id, []);
  const bulkSelection = useBulkSelection({
    items: enhancedShows,
    getItemId: getShowId,
  });

  const handleBulkComplete = useCallback(() => {
    bulkSelection.clearSelection();
    handleRetry(); // Refresh data after bulk action
  }, [bulkSelection, handleRetry]);

  // Real-time updates
  useRealTimeUpdates();

  // Update view mode URL param (tab is handled by useUrlTab)
  const updateViewModeParam = useCallback(
    (newViewMode: ViewMode) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (newViewMode === 'cards') {
            next.delete('view');
          } else {
            next.set('view', newViewMode);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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
      setTimeout(() => setIsTabSwitching(false), 300);
    },
    [selectedTab, setSelectedTab, user]
  );

  // Handle view mode change with URL update and loading state
  const handleViewModeChange = useCallback(
    (key: string) => {
      const newViewMode = key as ViewMode;
      if (newViewMode === viewMode) return;

      setIsViewModeChanging(true);
      setViewMode(newViewMode);
      updateViewModeParam(newViewMode);
      setTimeout(() => setIsViewModeChanging(false), 200);
    },
    [updateViewModeParam, viewMode]
  );

  // Sync view mode and club filter from URL on mount and param changes
  useEffect(() => {
    const viewFromUrl = (searchParams.get('view') as ViewMode) || 'cards';
    if (viewFromUrl !== viewMode) {
      queueMicrotask(() => setViewMode(viewFromUrl));
    }
    const clubFromUrl = searchParams.get('club');
    if (clubFromUrl && clubFromUrl !== (filters.club === 'all' ? null : filters.club)) {
      queueMicrotask(() => setFilters(prev => ({ ...prev, club: clubFromUrl })));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Breadcrumb items for PageHeader
  const breadcrumbs = useMemo(() => {
    const items = [{ label: 'Shows', href: '/shows', onClick: () => handleTabChange('all') }];

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
                <span className="hidden sm:inline">{action.label}</span>
                <span className="sm:hidden">Create</span>
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
              <span className="hidden sm:inline">{action.label}</span>
              <span className="sm:hidden">Create</span>
            </Button>
          );
        })}

        {authUser && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/calendar">
                <Button
                  variant="outline"
                  size="default"
                  className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm rounded-full"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Full Calendar</span>
                  <span className="sm:hidden">Calendar</span>
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Open full calendar with show management</TooltipContent>
          </Tooltip>
        )}
      </div>
    ),
    [tabQuickActions, authUser]
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
        if (tab.getCount) def.count = tab.getCount(shows, entries, user?.id);
        return def;
      }),
    [tabConfig.tabs, shows, entries, user?.id]
  );

  // Render shows in different view modes
  const renderShowsView = () => {
    if (enhancedShows.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title={hasActiveFilters ? 'No matching shows' : 'No shows found'}
          description={
            hasActiveFilters
              ? 'Try adjusting your filters or search to find what you are looking for.'
              : 'Check back soon for upcoming shows in your area.'
          }
          action={
            hasActiveFilters ? { label: 'Clear Filters', onClick: clearAllFilters } : undefined
          }
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

      case 'table':
        return (
          <ShowsTableView
            shows={enhancedShows}
            {...(canManageShows && {
              isSelected: bulkSelection.isSelected,
              onToggleSelect: bulkSelection.toggleItem,
              isAllSelected: bulkSelection.isAllSelected,
              onToggleAll: bulkSelection.toggleAll,
            })}
          />
        );

      case 'cards':
      default:
        return (
          <ShowCardGrid
            shows={enhancedShows}
            entries={entries}
            selectedTab={selectedTab}
            user={user}
            {...(canManageShows && {
              isSelected: bulkSelection.isSelected,
              onToggleSelect: bulkSelection.toggleItem,
            })}
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
        <ErrorState message="We couldn't load the shows." onRetry={handleRetry} />
      )}

      {/* Normal content */}
      {!isLoading && !hasError && (
        <>
          <PageHeader breadcrumbs={breadcrumbs} title="Shows" actions={actionButtons} />

          {/* Filter toolbar */}
          <div className="bg-card/30 border border-border/40 rounded-2xl p-4 space-y-3 backdrop-blur-sm">
            <SearchBar
              value={filters.search}
              onChange={value => setFilters(prev => ({ ...prev, search: value }))}
              placeholder="Search shows by name, location, or club..."
            />

            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                filters={chipFilters}
                values={chipFilterValues}
                onChange={handleChipFilterChange}
              />
              {user && selectedTab !== 'entries' && (
                <MineToggle
                  className="ml-auto"
                  isMine={isMine}
                  onToggle={toggleMine}
                  allLabel="All Shows"
                  mineLabel="My Shows"
                  allCount={allEnhancedShows.length}
                  mineCount={mineCount}
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-border/20">
              <div className="flex items-center gap-3">
                <ViewToggle modes={VIEW_MODES} active={viewMode} onChange={handleViewModeChange} />
                <ViewPicker
                  views={savedViewsList}
                  activeViewId={activeViewId}
                  getCurrentConfig={getCurrentConfig}
                  onApply={handleApplyView}
                  onSave={saveView}
                  onUpdate={updateView}
                  onDelete={deleteView}
                  onSetDefault={setDefault}
                  onClear={clearActiveView}
                />
              </div>

              <ResultsCount
                showing={enhancedShows.length}
                total={shows.length}
                filtered={hasActiveFilters}
                entityName={shows.length === 1 ? 'show' : 'shows'}
              />
            </div>
          </div>

          {/* Bulk Actions Bar — secretary/admin only */}
          {canManageShows && (
            <ShowBulkActionsBar
              selectedShows={bulkSelection.selectedItems}
              onClearSelection={bulkSelection.clearSelection}
              onBulkComplete={handleBulkComplete}
            />
          )}

          {/* Tabs */}
          <PrimaryTabs tabs={tabDefs} value={selectedTab} onValueChange={handleTabChange}>
            <TabsContent value={selectedTab}>
              {isTabSwitching || isViewModeChanging ? (
                <TabContentSkeleton viewMode={viewMode} count={4} />
              ) : (
                renderShowsView()
              )}
            </TabsContent>
          </PrimaryTabs>
        </>
      )}
    </PageShell>
  );
};

export default BrowseShowsPage;
