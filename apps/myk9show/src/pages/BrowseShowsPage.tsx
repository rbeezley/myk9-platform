import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useStatusUpdates } from '@/services/NotificationService';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
// import { useShowStore } from '@/store/showStore'; // Currently unused
import { useEntryStore } from '@/store/entryStore';
import { useShowsQuery } from '@/hooks/queries/useShowsDatabase';
import type { Show } from '@/types/show-types';
import { getTabsForUser, getUserShowContext, filterShowsForTab, enhanceShowsWithRelationships } from '@/utils/unified-shows-config';
import { ShowRelationship } from '@/types/unified-shows-types';
import { showRelationshipCache } from '@/utils/show-relationships';
import { getShowActions, getTabQuickActions } from '@/utils/show-actions';
import { 
  showManagementTracker, 
  syncShowRelationships, 
  getEnhancedShowContext,
  RelationshipPerformanceMonitor
} from '@/utils/show-management-tracking';
import type { TabConfiguration } from '@/types/unified-shows-types';
import { 
  Search, 
  Calendar, 
  MapPin, 
  Clock,
  Filter,
  DollarSign,
  Grid3X3,
  List,
  CalendarDays,
  Plus,
  Eye,
  UserPlus,
  Edit,
  Trophy,
  Download,
  Award,
  Printer,
  Settings,
  Users,
  FileText,
  ClipboardList,
  Edit3,
  FileOutput,
  BarChart3,
  X
} from 'lucide-react';
import { ShowCalendar } from '@/components/shows/ShowCalendar';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import '@/styles/apple-show-details.css';
import { 
  ShowsPageSkeleton, 
  TabContentSkeleton
} from '@/components/common/SkeletonLoaders';
import { EnhancedEmptyState } from '@/components/shows/EnhancedEmptyStates';
import { ShowPermissionValidator } from '@/utils/permissionValidation';

type ViewMode = 'grid' | 'list' | 'calendar';

interface ShowFilters {
  search: string;
  discipline: string;
  entryStatus: string;
  dateRange: string;
  location: string;
  organization: string;
}

const BrowseShowsPage: React.FC = () => {
  const { userWithRoles: user, loading: authLoading } = useAuthContext();
  const { data: shows = [], isLoading: showsLoading, error: showsError } = useShowsQuery();
  const { entries, isLoading: entriesLoading, error: entriesError, loadEntries } = useEntryStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [filteredShows, setFilteredShows] = useState<Show[]>([]);
  const [filters, setFilters] = useState<ShowFilters>({
    search: '',
    discipline: 'all',
    entryStatus: 'all',
    dateRange: 'upcoming',
    location: 'all',
    organization: 'all'
  });
  
  // Get initial values from URL params
  const initialTab = searchParams.get('tab') || 'all';
  const initialViewMode = (searchParams.get('view') as ViewMode) || 'grid';
  
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // Generate tab configuration based on user roles
  const tabConfig: TabConfiguration = useMemo(() => {
    return getTabsForUser(user);
  }, [user]);

  // Update selected tab if current tab is not available for this user (separate effect)
  useEffect(() => {
    if (!tabConfig.tabs.some(tab => tab.id === selectedTab)) {
      setSelectedTab(tabConfig.defaultTab);
    }
  }, [tabConfig, selectedTab]);

  // Get user show context for filtering with caching
  const userContext = useMemo(() => {
    return getUserShowContext(user, shows, entries);
  }, [user, shows, entries]);

  // Sync show relationships when user or data changes
  useEffect(() => {
    if (user?.id && shows.length > 0) {
      const startTime = performance.now();
      
      // Sync relationships with the new tracking system
      syncShowRelationships(shows, user);
      
      // Monitor performance only in development
      if (import.meta.env.DEV) {
        const duration = performance.now() - startTime;
        RelationshipPerformanceMonitor.getInstance().recordOperation('syncShowRelationships', duration);
      }
      
      // Clear old cache when switching users
      return () => {
        showRelationshipCache.clearUserCache(user.id);
        showManagementTracker.clearUserCache(user.id);
      };
    }
  }, [user, shows]);

  // Update URL params when tab or view mode changes
  const updateUrlParams = useCallback((newTab?: string, newViewMode?: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    
    if (newTab !== undefined) {
      if (newTab === 'all') {
        params.delete('tab'); // Don't clutter URL with default tab
      } else {
        params.set('tab', newTab);
      }
    }
    
    if (newViewMode !== undefined) {
      if (newViewMode === 'grid') {
        params.delete('view'); // Don't clutter URL with default view
      } else {
        params.set('view', newViewMode);
      }
    }
    
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle tab change with URL update and loading state
  const handleTabChange = useCallback((newTab: string) => {
    if (newTab === selectedTab) return;
    
    // Check if user has permission to access this tab
    if (!ShowPermissionValidator.canAccessTab(user, newTab)) {
      // Only audit access denied in development to reduce production overhead
      if (import.meta.env.DEV) {
        ShowPermissionValidator.auditAction(
          'tab_access_denied',
          user,
          'tab',
          newTab,
          false
        );
      }
      console.warn(`Access denied to tab: ${newTab}`);
      return;
    }
    
    // Audit successful tab access only in development
    if (import.meta.env.DEV) {
      ShowPermissionValidator.auditAction(
        'tab_accessed',
        user,
        'tab',
        newTab,
        true
      );
    }
    
    setIsTabSwitching(true);
    setSelectedTab(newTab);
    updateUrlParams(newTab, undefined);
    
    // Reset tab switching state after a brief delay
    setTimeout(() => setIsTabSwitching(false), 300);
  }, [updateUrlParams, selectedTab, user]);

  // Handle view mode change with URL update and loading state
  const handleViewModeChange = useCallback((newViewMode: ViewMode) => {
    if (newViewMode === viewMode) return;
    
    setIsViewModeChanging(true);
    setViewMode(newViewMode);
    updateUrlParams(undefined, newViewMode);
    
    // Reset view mode changing state after a brief delay
    setTimeout(() => setIsViewModeChanging(false), 200);
  }, [updateUrlParams, viewMode]);

  // Sync state with URL params on mount and param changes
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'all';
    const viewFromUrl = (searchParams.get('view') as ViewMode) || 'grid';
    
    if (tabFromUrl !== selectedTab) {
      setSelectedTab(tabFromUrl);
    }
    if (viewFromUrl !== viewMode) {
      setViewMode(viewFromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps -- selectedTab and viewMode intentionally excluded to avoid infinite loop

  // Real-time status updates for shows
  useStatusUpdates('shows', 'all');
  
  // Enhanced real-time updates with relationship tracking
  useRealTimeUpdates();
  
  // Periodic performance monitoring (development only)
  useEffect(() => {
    const performanceInterval = setInterval(() => {
      const metrics = RelationshipPerformanceMonitor.getInstance().getMetrics();
      if (Object.keys(metrics).length > 0) {
        console.log('🔍 Relationship tracking performance:', metrics);
      }
    }, 60000); // Log every minute
    
    return () => clearInterval(performanceInterval);
  }, []);

  // Consolidated loading and error states
  const isLoading = authLoading || showsLoading || entriesLoading;
  const hasError = showsError || entriesError;

  // Load data on mount with enhanced tracking integration
  useEffect(() => {
    const loadData = async () => {
      try {
        const startTime = performance.now();
        
        await loadEntries();
        
        // Monitor data loading performance only in development
        if (import.meta.env.DEV) {
          const duration = performance.now() - startTime;
          RelationshipPerformanceMonitor.getInstance().recordOperation('loadInitialData', duration);
        }
        
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, [loadEntries]);

  // Error handling with retry capability and relationship sync
  const handleRetry = useCallback(async () => {
    try {
      const startTime = performance.now();
      
      await loadEntries();
      
      // Re-sync relationships after successful data reload
      if (user?.id) {
        syncShowRelationships(shows, user);
      }
      
      // Monitor retry performance only in development
      if (import.meta.env.DEV) {
        const duration = performance.now() - startTime;
        RelationshipPerformanceMonitor.getInstance().recordOperation('retryDataLoad', duration);
      }
      
    } catch (error) {
      console.error('Retry failed:', error);
    }
  }, [loadEntries, user, shows]);

  // Enhanced shows with relationship metadata and permission filtering
  const enhancedShows = useMemo(() => {
    // Early return for empty arrays to avoid unnecessary processing
    if (!filteredShows || filteredShows.length === 0) {
      return [];
    }
    
    const startTime = performance.now();
    
    // First filter shows by permissions
    const permissionFilteredShows = ShowPermissionValidator.filterShows(filteredShows, user);
    
    // Early return if no shows remain after permission filtering
    if (permissionFilteredShows.length === 0) {
      return [];
    }
    
    if (!userContext) {
      const result = permissionFilteredShows.map(show => ({ 
        ...show, 
        relationship: ['all' as ShowRelationship], 
        userCanManage: false, 
        userIsJudging: false, 
        userHasEntries: false 
      }));
      
      // Monitor performance only in development and when there are actual shows
      if (import.meta.env.DEV && result.length > 0) {
        const duration = performance.now() - startTime;
        RelationshipPerformanceMonitor.getInstance().recordOperation('enhanceShowsWithRelationships', duration);
      }
      
      return result;
    }
    
    // Use enhanced tracking system for more detailed relationship context
    const enhanced = permissionFilteredShows.map(show => {
      const enhancedContext = getEnhancedShowContext(show, user, entries);
      const baseRelationship = enhanceShowsWithRelationships([show], userContext)[0];
      
      return {
        ...baseRelationship,
        // Add enhanced tracking information
        enhancedContext,
        userCanEdit: enhancedContext?.canEdit || false,
        userCanDelete: enhancedContext?.canDelete || false,
        userCanViewPrivateData: enhancedContext?.canViewPrivateData || false
      };
    });
    
    // Monitor performance only in development and when there are actual shows
    if (import.meta.env.DEV && enhanced.length > 0) {
      const duration = performance.now() - startTime;
      RelationshipPerformanceMonitor.getInstance().recordOperation('enhanceShowsWithRelationships', duration);
    }
    
    return enhanced;
  }, [filteredShows, userContext, user, entries]);

  // Get tab quick actions
  const tabQuickActions = useMemo(() => {
    return getTabQuickActions(selectedTab, user);
  }, [selectedTab, user]);

  // Generate breadcrumb items
  const breadcrumbItems = useMemo(() => {
    const items = [
      {
        label: 'Shows',
        href: '/browse-shows',
        onClick: () => handleTabChange('all')
      }
    ];

    // Add current tab as breadcrumb if not the default tab
    if (selectedTab !== 'all') {
      const currentTab = tabConfig.tabs.find(tab => tab.id === selectedTab);
      if (currentTab) {
        items.push({
          label: currentTab.label,
          href: '#',
          onClick: () => {}
        });
      }
    }

    return items;
  }, [selectedTab, tabConfig.tabs, handleTabChange]);

  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return filters.search !== '' ||
           filters.discipline !== 'all' ||
           filters.entryStatus !== 'all' ||
           filters.dateRange !== 'upcoming' ||
           filters.location !== 'all' ||
           filters.organization !== 'all';
  }, [filters]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      discipline: 'all',
      entryStatus: 'all',
      dateRange: 'upcoming',
      location: 'all',
      organization: 'all'
    });
  }, []);

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
              ShowPermissionValidator.auditAction('create_show_clicked', user, 'action', 'create_show', true);
              navigate('/secretary/create-show/wizard');
            } else {
              ShowPermissionValidator.auditAction('create_show_denied', user, 'action', 'create_show', false);
              console.warn('User does not have permission to create shows');
            }
          }}
          onRegisterShow={() => {
            ShowPermissionValidator.auditAction('register_clicked', user, 'action', 'register', true);
            console.log('Open registration');
          }}
          onFindShows={() => {
            ShowPermissionValidator.auditAction('find_shows_clicked', user, 'action', 'find_shows', true);
            if (selectedTab !== 'all') {
              handleTabChange('all');
            }
            if (hasActiveFilters) {
              clearAllFilters();
            }
          }}
        />
      );
    }

    switch (viewMode) {
      case 'calendar':
        return (
          <div className="mt-4">
            <ShowCalendar 
              onShowRegister={(showId) => console.log('Register for show:', showId)}
              shows={enhancedShows}
            />
          </div>
        );
      
      case 'list':
        return (
          <div className="space-y-4">
            {enhancedShows.map((show) => {
              const showActions = getShowActions(show, selectedTab, user);
              return (
              <Card 
                key={show.id} 
                className="bg-card/95 backdrop-blur-sm border-border/50 hover:shadow-md transition-all duration-200"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-semibold">{show.name}</h3>
                          <p className="text-sm text-muted-foreground">{show.events.join(', ')}</p>
                        </div>
                        <div className="flex gap-2">
                          {getTypeBadge(show.type)}
                          {getStatusBadge(show.status)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {new Date(show.startDate).toLocaleDateString()}
                            {show.startDate !== show.endDate && 
                              ` - ${new Date(show.endDate).toLocaleDateString()}`
                            }
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{show.location}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>{show.preEntryFee} entry fee</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>Closes {new Date(show.entryCloseDate).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {showActions.slice(0, 3).map((action) => {
                        const IconComponent = {
                          Eye, UserPlus, Edit, Trophy, Download, Award, Printer, Settings, Users, FileText, List, ClipboardList, Edit3, FileOutput, Plus
                        }[action.icon] || Eye;
                        return (
                          <Button 
                            key={action.id}
                            variant={action.variant}
                            size="sm"
                            onClick={() => action.onClick(show)}
                          >
                            <IconComponent className="h-4 w-4 mr-2" />
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        );
      
      case 'grid':
      default:
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {enhancedShows.map((show) => {
              const showActions = getShowActions(show, selectedTab, user);
              return (
              <div 
                key={show.id} 
                className="apple-browse-card"
              >
                <div className="apple-browse-card-header">
                  <div className="apple-browse-card-badges">
                    {getTypeBadge(show.type)}
                  </div>
                </div>

                <div className="apple-browse-card-content">
                  <h3 className="apple-browse-card-title">{show.name}</h3>
                  <p className="apple-browse-card-description">
                    {show.events.join(', ')}
                  </p>

                  <div className="apple-browse-card-details">
                    <div className="apple-browse-card-detail-item">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(show.startDate).toLocaleDateString()} 
                        {show.startDate !== show.endDate && 
                          ` - ${new Date(show.endDate).toLocaleDateString()}`
                        }
                      </span>
                    </div>
                    
                    <div className="apple-browse-card-detail-item">
                      <MapPin className="h-4 w-4" />
                      <span>{show.location}</span>
                    </div>
                    
                    <div className="apple-browse-card-detail-item">
                      <DollarSign className="h-4 w-4" />
                      <span>{show.preEntryFee} entry fee</span>
                    </div>
                    
                    <div className="apple-browse-card-detail-item">
                      <Clock className="h-4 w-4" />
                      <span>Entries close {new Date(show.entryCloseDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="apple-browse-card-footer">
                    {getStatusBadge(show.status)}
                    <div className="flex gap-2 flex-wrap">
                      {showActions.slice(0, 2).map((action) => {
                        const IconComponent = {
                          Eye, UserPlus, Edit, Trophy, Download, Award, Printer, Settings, Users, FileText, List, ClipboardList, Edit3, FileOutput, Plus
                        }[action.icon] || Eye;
                        return (
                          <Button 
                            key={action.id}
                            variant={action.variant}
                            size="sm"
                            onClick={() => action.onClick(show)}
                            className="apple-browse-view-details-btn"
                          >
                            <IconComponent className="h-4 w-4 mr-1" />
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        );
    }
  };

  // Audit page access and security events
  useEffect(() => {
    // Standard audit log
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
    
    // Security audit for page access
    ShowPermissionValidator.auditAction(
      'page_access',
      user,
      'page',
      'browse_shows',
      true
    );
  }, [user]);
  
  // Validate tab access on initial load
  useEffect(() => {
    if (selectedTab && !ShowPermissionValidator.canAccessTab(user, selectedTab)) {
      ShowPermissionValidator.auditAction(
        'invalid_tab_access_attempt',
        user,
        'tab',
        selectedTab,
        false
      );
      
      // Redirect to default accessible tab
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(user);
      if (accessibleTabs.length > 0) {
        handleTabChange(accessibleTabs[0]);
      }
    }
  }, [selectedTab, user, handleTabChange]);

  const applyFilters = useCallback(() => {
    // First apply tab-based filtering
    let filtered = filterShowsForTab(selectedTab, shows, entries, userContext);

    // Then apply user filters
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(show =>
        show.name.toLowerCase().includes(searchLower) ||
        show.location.toLowerCase().includes(searchLower) ||
        show.type.toLowerCase().includes(searchLower)
      );
    }

    // Discipline filter (map to show type)
    if (filters.discipline !== 'all') {
      const disciplineMap: Record<string, string> = {
        'agility': 'Agility',
        'scent_work': 'Scent Work',
        'rally': 'Rally',
        'obedience': 'Obedience'
      };
      const showType = disciplineMap[filters.discipline];
      if (showType) {
        filtered = filtered.filter(show => show.type.includes(showType));
      }
    }

    // Entry status filter (map to show status)
    if (filters.entryStatus !== 'all') {
      const statusMap: Record<string, string> = {
        'open': 'Upcoming',
        'closed': 'Completed',
        'closing_soon': 'Upcoming',
        'waitlist': 'Upcoming'
      };
      const showStatus = statusMap[filters.entryStatus];
      if (showStatus) {
        filtered = filtered.filter(show => show.status === showStatus);
      }
    }

    // Date range filter (only apply if not already filtered by tab)
    if (selectedTab !== 'past' && filters.dateRange !== 'all') {
      const now = new Date();
      if (filters.dateRange === 'upcoming') {
        filtered = filtered.filter(show => {
          const showDate = new Date(show.startDate);
          return showDate >= now;
        });
      } else if (filters.dateRange === 'this_month') {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        filtered = filtered.filter(show => {
          const showDate = new Date(show.startDate);
          return showDate >= now && showDate <= nextMonth;
        });
      }
    }

    // Sort by start date
    filtered.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    setFilteredShows(filtered);
  }, [shows, entries, userContext, selectedTab, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Upcoming':
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 border">
            Upcoming
          </Badge>
        );
      case 'Completed':
        return (
          <Badge className="bg-muted/10 text-muted-foreground border-muted/20 border">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border border">
            {status}
          </Badge>
        );
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'Agility': 'bg-primary/10 text-primary border-primary/20',
      'Scent Work': 'bg-success-green/10 text-success-green border-success-green/20',
      'Rally': 'bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20',
      'Obedience': 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
      'Nosework': 'bg-success-green/10 text-success-green border-success-green/20'
    };

    const colorClass = colors[type] || 'bg-muted/10 text-muted-foreground border-muted/20';

    return (
      <Badge className={`${colorClass} border`}>
        {type.toUpperCase()}
      </Badge>
    );
  };

  // Enhanced loading state management
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [isViewModeChanging, setIsViewModeChanging] = useState(false);

  // Error state component
  const ErrorState = () => (
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
          {/* Show loading state for initial load */}
          {isLoading && shows.length === 0 && (
            <ShowsPageSkeleton viewMode={viewMode} count={6} />
          )}

          {/* Show error state */}
          {hasError && !isLoading && (
            <>
              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">Shows</h1>
                <p className="text-muted-foreground text-lg">
                  Error loading show data
                </p>
              </div>
              <ErrorState />
            </>
          )}

          {/* Show normal content when data is loaded (even if empty) */}
          {!isLoading && !hasError && (
            <>
              {/* Breadcrumb */}
              <Breadcrumb 
                items={breadcrumbItems}
                showHomeIcon={true}
                className="text-sm text-muted-foreground"
              />
              
              {/* Enhanced Header */}
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                    Shows
                  </h1>
                  <p className="text-muted-foreground text-base lg:text-lg">
                    {user 
                      ? "Discover shows, manage entries, and track your competition schedule"
                      : "Discover and register for upcoming dog shows"
                    }
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {/* Tab-specific quick actions */}
                  {tabQuickActions.map((action) => {
                    const IconComponent = {
                      Plus, Users, Search, Download, Settings, BarChart3, Calendar, FileText
                    }[action.icon] || Plus;
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
                  
                  {/* Always show calendar link */}
                  <Link to="/calendar">
                    <Button variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-full">
                      <Calendar className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">View in Calendar</span>
                      <span className="sm:hidden">Calendar</span>
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Enhanced Filters */}
              <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:border-primary/30">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Filter className="h-5 w-5 text-primary" />
                      Filter Shows
                      {hasActiveFilters && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {Object.values(filters).filter(v => v !== 'all' && v !== 'upcoming' && v !== '').length} active
                        </Badge>
                      )}
                    </CardTitle>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search shows..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="pl-9 h-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg transition-all duration-200"
                      />
                    </div>

                    <Select
                      value={filters.discipline}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, discipline: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Discipline" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Disciplines</SelectItem>
                        <SelectItem value="agility">Agility</SelectItem>
                        <SelectItem value="scent_work">Scent Work</SelectItem>
                        <SelectItem value="rally">Rally</SelectItem>
                        <SelectItem value="obedience">Obedience</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.entryStatus}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, entryStatus: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Entry Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="closing_soon">Closing Soon</SelectItem>
                        <SelectItem value="waitlist">Waitlist</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.dateRange}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Date Range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="next_month">Next Month</SelectItem>
                        <SelectItem value="all">All Dates</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={filters.location}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, location: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        <SelectItem value="local">Within 50 miles</SelectItem>
                        <SelectItem value="regional">Within 200 miles</SelectItem>
                        <SelectItem value="online">Online Only</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      onClick={clearAllFilters}
                      disabled={!hasActiveFilters}
                      className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Enhanced View Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">View:</span>
                  <div className="flex bg-muted/50 rounded-lg p-1">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleViewModeChange('grid')}
                      className="h-8 px-3 transition-all duration-200"
                      disabled={isViewModeChanging}
                    >
                      <Grid3X3 className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Grid</span>
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleViewModeChange('list')}
                      className="h-8 px-3 transition-all duration-200"
                      disabled={isViewModeChanging}
                    >
                      <List className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">List</span>
                    </Button>
                    <Button
                      variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => handleViewModeChange('calendar')}
                      className="h-8 px-3 transition-all duration-200"
                      disabled={isViewModeChanging}
                    >
                      <CalendarDays className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Calendar</span>
                    </Button>
                  </div>
                </div>
                
                {/* Show count and filter status */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {shows.length > 0 ? (
                    <span>
                      {enhancedShows.length} of {shows.length} show{shows.length !== 1 ? 's' : ''}
                      {hasActiveFilters && ' (filtered)'}
                    </span>
                  ) : (
                    <span>No shows available</span>
                  )}
                </div>
              </div>

              {/* Enhanced Dynamic Tabs */}
              <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="overflow-x-auto">
                  <TabsList className="grid w-full bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 h-auto min-w-max" style={{gridTemplateColumns: `repeat(${tabConfig.tabs.length}, minmax(0, 1fr))`}}>
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
                            <Badge 
                              variant={selectedTab === tab.id ? 'default' : 'secondary'} 
                              className="text-xs px-1.5 py-0.5 min-w-[20px] justify-center"
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