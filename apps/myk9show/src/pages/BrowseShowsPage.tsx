import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStatusUpdates } from '@/services/NotificationService';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import type { Show } from '@/types/show-types';
import {
  Search,
  Calendar,
  Clock,
  Filter,
  Grid3X3,
  List,
  CalendarDays,
  Plus,
  Users,
  Download,
  Settings,
  FileText,
  BarChart3,
  X,
  Ticket,
  ChevronDown
} from 'lucide-react';
import { ShowCalendar } from '@/components/common/LazyComponents';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import '@/styles/apple-show-details.css';
import {
  ShowsPageSkeleton,
  TabContentSkeleton,
  ShowCalendarSkeleton
} from '@/components/common/SkeletonLoaders';
import { EnhancedEmptyState } from '@/components/shows/EnhancedEmptyStates';
import { ShowPermissionValidator } from '@/utils/permissionValidation';

// Extracted hooks and components
import { useBrowseShowsFilters } from '@/hooks/useBrowseShowsFilters';
import { useBrowseShowsData } from '@/hooks/useBrowseShowsData';
import { ShowsGridView, ShowsListView } from '@/components/shows/browse';
import {
  DISCIPLINE_LABELS,
  ENTRY_STATUS_LABELS,
  LOCATION_LABELS,
  DATE_RANGE_LABELS
} from '@/utils/browseShowsUtils';

type ViewMode = 'grid' | 'list' | 'calendar';

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
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Use extracted data hook (loads shows, entries, user context)
  const {
    user,
    isLoading,
    hasError,
    showsError,
    entriesError,
    shows,
    entries,
    tabConfig,
    userContext,
    tabQuickActions,
    quickStats,
    handleRetry
  } = useBrowseShowsData({ filteredShows: [], selectedTab });

  // Use extracted filter hook
  const {
    filters,
    setFilters,
    filteredShows,
    hasActiveFilters,
    clearAllFilters,
    activeFilterCount
  } = useBrowseShowsFilters({ shows, entries, userContext, selectedTab });

  // Get enhanced shows from data hook with actual filtered shows
  const { enhancedShows } = useBrowseShowsData({ filteredShows, selectedTab });

  // Update selected tab if current tab is not available for this user
  useEffect(() => {
    if (!tabConfig.tabs.some(tab => tab.id === selectedTab)) {
      queueMicrotask(() => setSelectedTab(tabConfig.defaultTab));
    }
  }, [tabConfig, selectedTab]);

  // Real-time status updates for shows
  useStatusUpdates('shows', 'all');
  useRealTimeUpdates();

  // Update URL params when tab or view mode changes
  const updateUrlParams = useCallback((newTab?: string, newViewMode?: ViewMode) => {
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
  }, [searchParams, setSearchParams]);

  // Handle tab change with URL update and loading state
  const handleTabChange = useCallback((newTab: string) => {
    if (newTab === selectedTab) return;

    if (!ShowPermissionValidator.canAccessTab(user, newTab)) {
      logger.warn(`Access denied to tab: ${newTab}`, 'shows', { tab: newTab, userId: user?.id });
      return;
    }

    setIsTabSwitching(true);
    setSelectedTab(newTab);
    updateUrlParams(newTab, undefined);
    setTimeout(() => setIsTabSwitching(false), 300);
  }, [updateUrlParams, selectedTab, user]);

  // Handle view mode change with URL update and loading state
  const handleViewModeChange = useCallback((newViewMode: ViewMode) => {
    if (newViewMode === viewMode) return;

    setIsViewModeChanging(true);
    setViewMode(newViewMode);
    updateUrlParams(undefined, newViewMode);
    setTimeout(() => setIsViewModeChanging(false), 200);
  }, [updateUrlParams, viewMode]);

  // Sync state with URL params on mount and param changes
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'all';
    const viewFromUrl = (searchParams.get('view') as ViewMode) || 'grid';

    if (tabFromUrl !== selectedTab) {
      queueMicrotask(() => setSelectedTab(tabFromUrl));
    }
    if (viewFromUrl !== viewMode) {
      queueMicrotask(() => setViewMode(viewFromUrl));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items = [{ label: 'Shows', href: '/browse-shows', onClick: () => handleTabChange('all') }];

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
        accessibleTabs: ShowPermissionValidator.getAccessibleTabs(user)
      }
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
        <EnhancedEmptyState
          tab={selectedTab}
          user={user}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
          onCreateShow={() => {
            if (ShowPermissionValidator.canCreate(user)) {
              navigate('/secretary/create-show/wizard');
            } else {
              logger.warn('User does not have permission to create shows', 'shows', { userId: user?.id });
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
      case 'calendar':
        return (
          <div className="mt-4">
            <Suspense fallback={<ShowCalendarSkeleton />}>
              <ShowCalendar
                onShowRegister={(showId) => logger.debug('Register for show', 'shows', { showId })}
                shows={enhancedShows}
              />
            </Suspense>
          </div>
        );

      case 'list':
        return <ShowsListView shows={enhancedShows} entries={entries} selectedTab={selectedTab} user={user} />;

      case 'grid':
      default:
        return <ShowsGridView shows={enhancedShows} entries={entries} selectedTab={selectedTab} user={user} />;
    }
  };

  // Error state content
  const errorStateContent = (
    <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
      <CardContent className="p-12 text-center">
        <div className="bg-error-red/10 rounded-full p-6 mb-4 inline-block">
          <X className="h-12 w-12 text-error-red" />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-error-red">Error Loading Shows</h3>
        <p className="text-muted-foreground max-w-sm mx-auto mb-6">
          {showsError?.message || entriesError || "There was a problem loading the shows data. Please try again."}
        </p>
        <Button onClick={handleRetry} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Loading state */}
          {isLoading && shows.length === 0 && <ShowsPageSkeleton viewMode={viewMode} count={6} />}

          {/* Error state */}
          {hasError && !isLoading && (
            <>
              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">Shows</h1>
                <p className="text-muted-foreground text-lg">Error loading show data</p>
              </div>
              {errorStateContent}
            </>
          )}

          {/* Normal content */}
          {!isLoading && !hasError && (
            <>
              <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="text-sm text-muted-foreground" />

              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Shows</h1>
                  <p className="text-muted-foreground text-base lg:text-lg">
                    {user ? "Discover shows, manage entries, and track your competition schedule" : "Discover and register for upcoming dog shows"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {tabQuickActions.map((action) => {
                    const IconComponent = { Plus, Users, Search, Download, Settings, BarChart3, Calendar, FileText }[action.icon] || Plus;
                    return action.permission ? (
                      <PermissionGuard key={action.id} permission={action.permission}>
                        <Button variant={action.variant} size="sm" onClick={() => action.onClick({} as Show)}>
                          <IconComponent className="h-4 w-4 mr-2" />
                          <span className="hidden sm:inline">{action.label}</span>
                          <span className="sm:hidden">Create</span>
                        </Button>
                      </PermissionGuard>
                    ) : (
                      <Button key={action.id} variant={action.variant} size="sm" onClick={() => action.onClick({} as Show)}>
                        <IconComponent className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">{action.label}</span>
                        <span className="sm:hidden">Create</span>
                      </Button>
                    );
                  })}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link to="/calendar">
                        <Button variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-full">
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
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search shows..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-9 h-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                      />
                    </div>
                    <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all duration-200 gap-2">
                          <Filter className="h-4 w-4" />
                          <span>Filters</span>
                          {hasActiveFilters && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{activeFilterCount}</Badge>}
                          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isFiltersOpen && "rotate-180")} />
                        </Button>
                      </CollapsibleTrigger>
                    </Collapsible>
                  </div>

                  {/* Active filter chips */}
                  {hasActiveFilters && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {filters.discipline !== 'all' && (
                        <Badge variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setFilters(prev => ({ ...prev, discipline: 'all' }))}>
                          {DISCIPLINE_LABELS[filters.discipline] || filters.discipline}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.entryStatus !== 'all' && (
                        <Badge variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setFilters(prev => ({ ...prev, entryStatus: 'all' }))}>
                          {ENTRY_STATUS_LABELS[filters.entryStatus] || filters.entryStatus}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.dateRange !== 'upcoming' && filters.dateRange !== 'all' && (
                        <Badge variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setFilters(prev => ({ ...prev, dateRange: 'upcoming' }))}>
                          {DATE_RANGE_LABELS[filters.dateRange] || filters.dateRange}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.location !== 'all' && (
                        <Badge variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setFilters(prev => ({ ...prev, location: 'all' }))}>
                          {LOCATION_LABELS[filters.location] || filters.location}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {filters.search && (
                        <Badge variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setFilters(prev => ({ ...prev, search: '' }))}>
                          "{filters.search}"
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 px-2 text-xs text-muted-foreground hover:text-primary">
                        Clear all
                      </Button>
                    </div>
                  )}

                  {/* Filter dropdowns */}
                  <Collapsible open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                    <CollapsibleContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 mt-4 border-t border-border/50">
                        <Select value={filters.discipline} onValueChange={(value) => setFilters(prev => ({ ...prev, discipline: value }))}>
                          <SelectTrigger><SelectValue placeholder="Discipline" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Disciplines</SelectItem>
                            <SelectItem value="agility">Agility</SelectItem>
                            <SelectItem value="scent_work">Scent Work</SelectItem>
                            <SelectItem value="rally">Rally</SelectItem>
                            <SelectItem value="obedience">Obedience</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={filters.entryStatus} onValueChange={(value) => setFilters(prev => ({ ...prev, entryStatus: value }))}>
                          <SelectTrigger><SelectValue placeholder="Entry Status" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="closing_soon">Closing Soon</SelectItem>
                            <SelectItem value="waitlist">Waitlist</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                          <SelectTrigger><SelectValue placeholder="Date Range" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="upcoming">Upcoming</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="next_month">Next Month</SelectItem>
                            <SelectItem value="all">All Dates</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={filters.location} onValueChange={(value) => setFilters(prev => ({ ...prev, location: value }))}>
                          <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Locations</SelectItem>
                            <SelectItem value="local">Within 50 miles</SelectItem>
                            <SelectItem value="regional">Within 200 miles</SelectItem>
                            <SelectItem value="online">Online Only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>

              {/* View Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <div className="flex bg-muted/50 rounded-lg p-1">
                    {(['grid', 'list', 'calendar'] as const).map((mode) => {
                      const Icon = { grid: Grid3X3, list: List, calendar: CalendarDays }[mode];
                      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
                      return (
                        <Tooltip key={mode}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={viewMode === mode ? 'default' : 'ghost'}
                              size="sm"
                              onClick={() => handleViewModeChange(mode)}
                              className="h-8 px-3 transition-all duration-200"
                              disabled={isViewModeChanging}
                            >
                              <Icon className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">{label}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="sm:hidden">{label} View</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>

                {/* Quick stats summary */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {enhancedShows.length} of {shows.length} show{shows.length !== 1 ? 's' : ''}
                    {hasActiveFilters && ' (filtered)'}
                  </span>
                  {shows.length > 0 && (
                    <div className="hidden sm:flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 rounded-full">
                        <Calendar className="h-3 w-3 text-primary" />
                        <span className="font-medium">{quickStats.upcoming}</span>
                        <span className="text-muted-foreground">upcoming</span>
                      </span>
                      {quickStats.userEntries > 0 && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 rounded-full">
                          <Ticket className="h-3 w-3 text-green-600" />
                          <span className="font-medium text-green-600">{quickStats.userEntries}</span>
                          <span className="text-green-600/70">entered</span>
                        </span>
                      )}
                      {quickStats.closingSoon > 0 && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/10 rounded-full">
                          <Clock className="h-3 w-3 text-orange-600" />
                          <span className="font-medium text-orange-600">{quickStats.closingSoon}</span>
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
                  <TabsList className="grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto min-w-max" style={{ gridTemplateColumns: `repeat(${tabConfig.tabs.length}, minmax(0, 1fr))` }}>
                    {tabConfig.tabs.map((tab) => {
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
                            <Badge variant={selectedTab === tab.id ? 'default' : 'secondary'} className="text-xs px-1.5 py-0.5 min-w-[20px] justify-center">
                              {count}
                            </Badge>
                          </span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                <TabsContent value={selectedTab}>
                  {isTabSwitching || isViewModeChanging ? <TabContentSkeleton viewMode={viewMode} count={4} /> : renderShowsView()}
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
