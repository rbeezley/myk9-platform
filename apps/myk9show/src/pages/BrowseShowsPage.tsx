import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const navigate = useNavigate();

  // Get initial values from URL params
  const initialTab = searchParams.get('tab') || 'all';
  const initialViewMode = (searchParams.get('view') as ViewMode) || 'cards';

  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [isViewModeChanging, setIsViewModeChanging] = useState(false);

  // Use extracted data hook (loads shows, entries, user context)
  const {
    user,
    isLoading,
    hasError,
    shows,
    entries,
    tabConfig,
    userContext,
    tabQuickActions,
    handleRetry,
  } = useBrowseShowsData({ filteredShows: [], selectedTab });

  // Use extracted filter hook
  const { filters, setFilters, filteredShows, hasActiveFilters, clearAllFilters } =
    useBrowseShowsFilters({ shows, entries, userContext, selectedTab });

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
    [savedViewsList, applyView, setFilters]
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
        key: 'location',
        label: 'Location',
        options: [
          { label: 'Within 50 miles', value: 'within_50' },
          { label: 'Within 100 miles', value: 'within_100' },
          { label: 'Within 200 miles', value: 'within_200' },
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
    if (filters.dateRange !== 'all') values.dateRange = filters.dateRange;
    if (filters.location !== 'all') values.location = filters.location;
    if (filters.club !== 'all') values.club = filters.club;
    return values;
  }, [filters.discipline, filters.entryStatus, filters.dateRange, filters.location, filters.club]);

  const handleChipFilterChange = useCallback(
    (key: string, value: string | null) => {
      setFilters(prev => ({ ...prev, [key]: value || 'all' }));
    },
    [setFilters]
  );

  // Get enhanced shows from data hook with actual filtered shows
  const { enhancedShows: allEnhancedShows } = useBrowseShowsData({ filteredShows, selectedTab });

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

  // Update selected tab if current tab is not available for this user
  useEffect(() => {
    if (!tabConfig.tabs.some(tab => tab.id === selectedTab)) {
      queueMicrotask(() => setSelectedTab(tabConfig.defaultTab));
    }
  }, [tabConfig, selectedTab]);

  // Real-time updates
  useRealTimeUpdates();

  // Update URL params when tab or view mode changes
  const updateUrlParams = useCallback(
    (newTab?: string, newViewMode?: ViewMode) => {
      const params = new URLSearchParams(searchParams);

      if (newTab !== undefined) {
        if (newTab === 'all') {
          params.delete('tab');
        } else {
          params.set('tab', newTab);
        }
      }

      if (newViewMode !== undefined) {
        if (newViewMode === 'cards') {
          params.delete('view');
        } else {
          params.set('view', newViewMode);
        }
      }

      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Handle tab change with URL update and loading state
  const handleTabChange = useCallback(
    (newTab: string) => {
      if (newTab === selectedTab) return;

      if (!ShowPermissionValidator.canAccessTab(user, newTab)) {
        logger.warn(`Access denied to tab: ${newTab}`, 'shows', { tab: newTab, userId: user?.id });
        return;
      }

      setIsTabSwitching(true);
      setSelectedTab(newTab);
      updateUrlParams(newTab, undefined);
      setTimeout(() => setIsTabSwitching(false), 300);
    },
    [updateUrlParams, selectedTab, user]
  );

  // Handle view mode change with URL update and loading state
  const handleViewModeChange = useCallback(
    (key: string) => {
      const newViewMode = key as ViewMode;
      if (newViewMode === viewMode) return;

      setIsViewModeChanging(true);
      setViewMode(newViewMode);
      updateUrlParams(undefined, newViewMode);
      setTimeout(() => setIsViewModeChanging(false), 200);
    },
    [updateUrlParams, viewMode]
  );

  // Sync state with URL params on mount and param changes
  useEffect(() => {
    const rawTab = searchParams.get('tab') || tabConfig.defaultTab;
    const tabFromUrl = tabConfig.tabs.some(t => t.id === rawTab) ? rawTab : tabConfig.defaultTab;
    const viewFromUrl = (searchParams.get('view') as ViewMode) || 'cards';

    if (tabFromUrl !== selectedTab) {
      queueMicrotask(() => setSelectedTab(tabFromUrl));
    }
    if (viewFromUrl !== viewMode) {
      queueMicrotask(() => setViewMode(viewFromUrl));
    }
    const clubFromUrl = searchParams.get('club');
    if (clubFromUrl && clubFromUrl !== (filters.club === 'all' ? null : filters.club)) {
      queueMicrotask(() => setFilters(prev => ({ ...prev, club: clubFromUrl })));
    }
  }, [searchParams, tabConfig]); // eslint-disable-line react-hooks/exhaustive-deps

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
      </div>
    ),
    [tabQuickActions, navigate]
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

  // Validate tab access on initial load
  useEffect(() => {
    if (selectedTab && !ShowPermissionValidator.canAccessTab(user, selectedTab)) {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(user);
      if (accessibleTabs.length > 0) {
        queueMicrotask(() => handleTabChange(accessibleTabs[0]));
      }
    }
  }, [selectedTab, user, handleTabChange]);

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
            hasActiveFilters
              ? { label: 'Clear Filters', onClick: clearAllFilters }
              : undefined
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
            isSelected={bulkSelection.isSelected}
            onToggleSelect={bulkSelection.toggleItem}
            isAllSelected={bulkSelection.isAllSelected}
            onToggleAll={bulkSelection.toggleAll}
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
            isSelected={bulkSelection.isSelected}
            onToggleSelect={bulkSelection.toggleItem}
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

          <SearchBar
            value={filters.search}
            onChange={value => setFilters(prev => ({ ...prev, search: value }))}
            placeholder="Search shows by name, location, or club..."
          />

          <FilterChips
            filters={chipFilters}
            values={chipFilterValues}
            onChange={handleChipFilterChange}
          />

          <MineToggle
            isMine={isMine}
            onToggle={toggleMine}
            allLabel="All Shows"
            mineLabel="My Shows"
            allCount={allEnhancedShows.length}
            mineCount={mineCount}
            hidden={!user}
          />

          {/* View controls + results count */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

          {/* Bulk Actions Bar */}
          <ShowBulkActionsBar
            selectedShows={bulkSelection.selectedItems}
            onClearSelection={bulkSelection.clearSelection}
            onBulkComplete={handleBulkComplete}
          />

          {/* Tabs */}
          <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-6">
            <div className="overflow-x-auto">
              <TabsList
                className="grid w-full bg-muted/50 border border-border/30 rounded-xl p-1 h-auto min-w-max"
                style={{
                  gridTemplateColumns: `repeat(${tabConfig.tabs.length}, minmax(0, 1fr))`,
                }}
              >
                {tabConfig.tabs.map(tab => {
                  const count = tab.getCount ? tab.getCount(shows, entries, user?.id) : 0;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap"
                      title={tab.description}
                      disabled={isTabSwitching}
                    >
                      <span className="flex items-center gap-2">
                        {tab.label}
                        <Badge
                          variant={selectedTab === tab.id ? 'default' : 'secondary'}
                          className="text-sm px-1.5 py-0.5 min-w-[20px] justify-center"
                        >
                          {count}
                        </Badge>
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <TabsContent value={selectedTab}>
              {isTabSwitching || isViewModeChanging ? (
                <TabContentSkeleton viewMode={viewMode} count={4} />
              ) : (
                renderShowsView()
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageShell>
  );
};

export default BrowseShowsPage;
