import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import type { Show } from '@/types/show-types';
import {
  Search,
  Calendar,
  Clock,
  Grid3X3,
  List,
  Table2,
  CalendarDays,
  Columns3,
  Plus,
  Users,
  Download,
  Settings,
  FileText,
  BarChart3,
  X,
  Ticket,
} from 'lucide-react';
import { FilterBar } from '@/components/common/FilterBar';
import type { FilterDefinition, FilterBarState } from '@/components/common/FilterBar';
import { ShowCalendar } from '@/components/common/LazyComponents';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import '@/styles/myk9-show-details.css';

import {
  ShowsPageSkeleton,
  TabContentSkeleton,
  ShowCalendarSkeleton,
} from '@/components/common/SkeletonLoaders';
import { EnhancedEmptyState } from '@/components/shows/EnhancedEmptyStates';
import { ShowPermissionValidator } from '@/utils/permissionValidation';

// Extracted hooks and components
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import { useBrowseShowsData } from '@/hooks/useBrowseShowsData';
import { ShowsGridView, ShowsListView, ShowsTableView } from '@/components/shows/browse';
import { ViewPicker } from '@/components/common/ViewPicker';
import { KanbanView, type KanbanColumn } from '@/components/common/KanbanView';
import { useSavedViews, type ViewConfig } from '@/hooks/useSavedViews';
import { parseLocalDateString } from '@myk9/core';
import { useShowStore } from '@/store/showStore';

type ViewMode = 'grid' | 'list' | 'table' | 'calendar' | 'kanban';

const SHOW_KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'entries_open', label: 'Entries Open' },
  { key: 'entries_closed', label: 'Entries Closed' },
  { key: 'show_day', label: 'Show Day' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

/** Derive a kanban column key from show data. */
function getShowKanbanStatus(show: Show): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (show.status === 'archived' || show.status === 'cancelled') return 'archived';
  if (show.status === 'completed') return 'completed';

  const start = show.startDate ? parseLocalDateString(show.startDate) : undefined;
  const end = show.endDate ? parseLocalDateString(show.endDate) : start;
  const entryOpen = show.entryOpenDate ? parseLocalDateString(show.entryOpenDate) : undefined;
  const entryClose = show.entryCloseDate ? parseLocalDateString(show.entryCloseDate) : undefined;

  if (end && today > end) return 'completed';
  if (start && end && today >= start && today <= end) return 'show_day';
  if (entryClose && today > entryClose) return 'entries_closed';
  if (entryOpen && today >= entryOpen) return 'entries_open';
  return 'planning';
}

/**
 * Maps a kanban column key to an actual show status value.
 * Date-derived columns (entries_open, entries_closed, show_day) map to 'active'
 * since those columns are determined by the show's date fields, not its status.
 */
const KANBAN_TO_SHOW_STATUS: Record<string, string> = {
  planning: 'planning',
  entries_open: 'active',
  entries_closed: 'active',
  show_day: 'active',
  completed: 'completed',
  archived: 'archived',
};

const BrowseShowsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Get initial values from URL params
  const initialTab = searchParams.get('tab') || 'all';
  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';

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
    quickStats,
    handleRetry,
  } = useBrowseShowsData({ filteredShows: [], selectedTab });

  // Use extracted filter hook
  const { filters, setFilters, filteredShows, hasActiveFilters, clearAllFilters } =
    useBrowseShowsFilters({ shows, entries, userContext, selectedTab });

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

  // Show store for status updates via kanban drag-and-drop
  const updateShow = useShowStore(state => state.updateShow);

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

  // FilterBar definitions for the 4 show filters
  const filterDefs: FilterDefinition[] = useMemo(
    () => [
      {
        key: 'discipline',
        label: 'Discipline',
        type: 'select' as const,
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
        type: 'select' as const,
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
        type: 'select' as const,
        options: [
          { label: 'Upcoming', value: 'upcoming' },
          { label: 'This Month', value: 'this_month' },
          { label: 'Next Month', value: 'next_month' },
        ],
      },
      {
        key: 'location',
        label: 'Location',
        type: 'select' as const,
        options: [
          { label: 'Within 50 miles', value: 'within_50' },
          { label: 'Within 100 miles', value: 'within_100' },
          { label: 'Within 200 miles', value: 'within_200' },
        ],
      },
      {
        key: 'club',
        label: 'Club',
        type: 'select' as const,
        options: clubFilterOptions,
      },
    ],
    [clubFilterOptions]
  );

  // Bridge existing filters state to FilterBarState
  const filterBarState: FilterBarState = useMemo(() => {
    const filterState: Record<string, string | string[] | boolean> = {};
    if (filters.discipline !== 'all') filterState.discipline = filters.discipline;
    if (filters.entryStatus !== 'all') filterState.entryStatus = filters.entryStatus;
    if (filters.dateRange !== 'all') filterState.dateRange = filters.dateRange;
    if (filters.location !== 'all') filterState.location = filters.location;
    if (filters.club !== 'all') filterState.club = filters.club;
    return { filters: filterState, sortKey: null, sortDirection: 'asc' as const };
  }, [filters.discipline, filters.entryStatus, filters.dateRange, filters.location, filters.club]);

  // Bridge FilterBarState changes back to existing setFilters
  const handleFilterBarChange = useCallback(
    (newState: FilterBarState) => {
      setFilters(prev => ({
        ...prev,
        discipline: (newState.filters.discipline as string) || 'all',
        entryStatus: (newState.filters.entryStatus as string) || 'all',
        dateRange: (newState.filters.dateRange as string) || 'all',
        location: (newState.filters.location as string) || 'all',
        club: (newState.filters.club as string) || 'all',
      }));
    },
    [setFilters]
  );

  // Get enhanced shows from data hook with actual filtered shows
  const { enhancedShows } = useBrowseShowsData({ filteredShows, selectedTab });

  /** Handle kanban card drag to a new column — updates the show's status. */
  const handleKanbanStatusChange = useCallback(
    (showId: string, newKanbanColumn: string) => {
      const newStatus = KANBAN_TO_SHOW_STATUS[newKanbanColumn];
      if (!newStatus) return;

      const show = enhancedShows.find(s => s.id === showId);
      if (!show) return;

      // Skip if the show already has this status (date-derived columns can't be changed via status)
      if (show.status === newStatus) {
        logger.info('Show already has this status; column is date-derived', 'shows', {
          showId,
          currentStatus: show.status,
          targetColumn: newKanbanColumn,
        });
        return;
      }

      logger.info('Updating show status via kanban', 'shows', {
        showId,
        showName: show.name,
        fromStatus: show.status,
        toStatus: newStatus,
        targetColumn: newKanbanColumn,
      });

      updateShow(showId, { status: newStatus }).catch(error => {
        logger.error('Failed to update show status', 'shows', { showId, error });
      });
    },
    [enhancedShows, updateShow]
  );

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
        if (newViewMode === 'grid') {
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
    (newViewMode: ViewMode) => {
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
    // Only apply if the tab is valid for this user; otherwise fall back to default
    const tabFromUrl = tabConfig.tabs.some(t => t.id === rawTab) ? rawTab : tabConfig.defaultTab;
    const viewFromUrl = (searchParams.get('view') as ViewMode) || 'grid';

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

  // Generate breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items = [{ label: 'Shows', href: '/shows', onClick: () => handleTabChange('all') }];

    if (selectedTab !== 'all') {
      const currentTab = tabConfig.tabs.find(tab => tab.id === selectedTab);
      if (currentTab) {
        items.push({ label: currentTab.label, href: '#', onClick: () => {} });
      }
    }

    return items;
  }, [selectedTab, tabConfig.tabs, handleTabChange]);

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

  // Kanban card renderer (stable reference for KanbanView)
  const renderKanbanCard = useCallback(
    (show: Show) => (
      <Link
        to={`/shows/${show.id}`}
        className="group block rounded-2xl border border-border bg-gradient-to-br from-card to-card/80 p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative">
          <div className="font-bold text-sm leading-tight truncate group-hover:text-primary transition-colors duration-300">
            {show.name}
          </div>
          {show.location && (
            <div className="text-xs text-muted-foreground mt-1.5 truncate">{show.location}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1.5">
            {show.startDate
              ? (parseLocalDateString(show.startDate.slice(0, 10))?.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                }) ?? 'No date')
              : 'No date'}
            {show.organization && ` \u00b7 ${show.organization}`}
          </div>
        </div>
      </Link>
    ),
    []
  );

  // Render shows in different view modes
  const renderShowsView = () => {
    if (enhancedShows.length === 0) {
      return (
        <EnhancedEmptyState
          tab={selectedTab}
          user={user}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
          onCreateShow={() => {
            if (ShowPermissionValidator.canCreate(user)) {
              navigate('/secretary/create-show/wizard');
            } else {
              logger.warn('User does not have permission to create shows', 'shows', {
                userId: user?.id,
              });
            }
          }}
          onRegisterShow={() => logger.debug('Open registration clicked', 'shows')}
          onFindShows={() => {
            if (selectedTab !== 'all') handleTabChange('all');
            if (hasActiveFilters) clearAllFilters();
          }}
        />
      );
    }

    switch (viewMode) {
      case 'kanban':
        return (
          <KanbanView
            items={enhancedShows}
            columns={SHOW_KANBAN_COLUMNS}
            getItemStatus={getShowKanbanStatus}
            renderCard={renderKanbanCard}
            onStatusChange={handleKanbanStatusChange}
            className="mt-4"
          />
        );

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
        return <ShowsTableView shows={enhancedShows} />;

      case 'list':
        return (
          <ShowsListView
            shows={enhancedShows}
            entries={entries}
            selectedTab={selectedTab}
            user={user}
          />
        );

      case 'grid':
      default:
        return (
          <ShowsGridView
            shows={enhancedShows}
            entries={entries}
            selectedTab={selectedTab}
            user={user}
          />
        );
    }
  };

  // Error state content
  const errorStateContent = (
    <Card className="bg-gradient-to-br from-card to-card/80 backdrop-blur-xl border-border/50 shadow-sm rounded-2xl">
      <CardContent className="p-12 text-center">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-error-red/10 rounded-full p-6">
            <X className="h-12 w-12 text-error-red" />
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-2 text-error-red">Error Loading Shows</h3>
        <p className="text-muted-foreground max-w-sm mx-auto mb-6">
          There was a problem loading the shows data. Please try again.
        </p>
        <Button
          onClick={handleRetry}
          variant="outline"
          className="hover:-translate-y-0.5 transition-all duration-300"
        >
          <Download className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-8">
          {/* Loading state */}
          {isLoading && shows.length === 0 && <ShowsPageSkeleton viewMode={viewMode} count={6} />}

          {/* Error state */}
          {hasError && !isLoading && (
            <>
              <Breadcrumb
                items={breadcrumbItems}
                showHomeIcon={true}
                className="text-sm text-muted-foreground"
              />
              {errorStateContent}
            </>
          )}

          {/* Normal content */}
          {!isLoading && !hasError && (
            <>
              <h1 className="sr-only">Shows</h1>
              <div className="flex items-center justify-between">
                <Breadcrumb
                  items={breadcrumbItems}
                  showHomeIcon={true}
                  className="text-sm text-muted-foreground"
                />

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
                          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-full"
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
              </div>

              {/* Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search shows..."
                      value={filters.search}
                      onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      className="pl-9 h-10 bg-background border border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                    />
                  </div>

                  <FilterBar
                    filterDefs={filterDefs}
                    state={filterBarState}
                    onStateChange={handleFilterBarChange}
                    className="mt-3"
                  />
                </CardContent>
              </Card>

              {/* View Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <div className="flex bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                    {(['grid', 'list', 'table', 'calendar', 'kanban'] as const).map(mode => {
                      const Icon = {
                        grid: Grid3X3,
                        list: List,
                        table: Table2,
                        calendar: CalendarDays,
                        kanban: Columns3,
                      }[mode];
                      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                      return (
                        <Tooltip key={mode}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={viewMode === mode ? 'default' : 'ghost'}
                              size="default"
                              onClick={() => handleViewModeChange(mode)}
                              className="h-10 px-3 transition-all duration-200"
                              disabled={isViewModeChanging}
                            >
                              <Icon className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">{label}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="sm:hidden">
                            {label} View
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
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

                {/* Quick stats summary */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {enhancedShows.length} of {shows.length} show{shows.length !== 1 ? 's' : ''}
                    {hasActiveFilters && ' (filtered)'}
                  </span>
                  {shows.length > 0 && (
                    <div className="hidden sm:flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 rounded-full">
                        <Calendar className="h-3 w-3 text-primary" />
                        <span className="font-medium">{quickStats.upcoming}</span>
                        <span className="text-muted-foreground">upcoming</span>
                      </span>
                      {quickStats.userEntries > 0 && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-full">
                          <Ticket className="h-3 w-3 text-green-600" />
                          <span className="font-medium text-green-600">
                            {quickStats.userEntries}
                          </span>
                          <span className="text-green-600/70">entered</span>
                        </span>
                      )}
                      {quickStats.closingSoon > 0 && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/10 rounded-full">
                          <Clock className="h-3 w-3 text-orange-600" />
                          <span className="font-medium text-orange-600">
                            {quickStats.closingSoon}
                          </span>
                          <span className="text-orange-600/70">closing soon</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="overflow-x-auto">
                  <TabsList
                    className="grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto min-w-max"
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
                          className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300 px-4 py-2 text-sm font-medium whitespace-nowrap"
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
        </div>
      </div>
    </div>
  );
};

export default BrowseShowsPage;
