import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { logger } from '../../utils/logger';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { useOptimisticUpdate } from '../../hooks/useOptimisticUpdate';
import { usePrefetch } from '@/hooks/usePrefetch';
import { supabase } from '../../lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class } from '@/services/replication';
import { HamburgerMenu, CompactOfflineIndicator, ArmbandBadge, TrialDateBadge, RefreshIndicator, ErrorState, PullToRefresh, InstallPrompt, TabBar, FilterPanel, FilterTriggerButton } from '../../components/ui';
import type { Tab, SortOption } from '../../components/ui';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useLongPress } from '@/hooks/useLongPress';
import { useSettingsStore } from '@/stores/settingsStore';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RefreshCw, Heart, Calendar, Users2, Home as HomeIcon } from 'lucide-react';
import { useHomeDashboardData } from './hooks/useHomeDashboardData';
import type { EntryData, TrialData } from './hooks/useHomeDashboardData';
import { Onboarding } from '@/components/Onboarding/Onboarding';
import './Home.css';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showContext, logout: _logout, role } = useAuth();
  const { hasPermission: _hasPermission } = usePermission();
  const hapticFeedback = useHapticFeedback();
  const { prefetch } = usePrefetch();
  const { settings } = useSettingsStore();

  // ✨ React Query: Replace useStaleWhileRevalidate with automatic caching
  const {
    trials: trialsData,
    entries: entriesData,
    isLoading,
    isRefreshing,
    error: fetchError,
    refetch
  } = useHomeDashboardData(showContext?.licenseKey, showContext?.showId);

  // Search, sort, and filter state
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'armband' | 'name' | 'handler'>('armband');
  // Initialize filterBy from: 1) navigation state, 2) sessionStorage, 3) 'all' default
  // This ensures the tab persists when navigating away and back (e.g., after check-in)
  const locationState = location.state as { filter?: 'all' | 'favorites' } | null;
  const [filterBy, setFilterBy] = useState<'all' | 'favorites'>(() => {
    // Priority: navigation state > sessionStorage > default
    if (locationState?.filter) return locationState.filter;
    const savedFilter = sessionStorage.getItem('home_dog_filter');
    if (savedFilter === 'all' || savedFilter === 'favorites') return savedFilter;
    return 'all';
  });

  // Persist filter tab to sessionStorage so it survives navigation (e.g., checking in from Favorites)
  useEffect(() => {
    sessionStorage.setItem('home_dog_filter', filterBy);
  }, [filterBy]);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding_completed');
  });

  // Local state for favorites and entries with favorites applied
  const [favoriteDogs, setFavoriteDogs] = useState<Set<number>>(new Set());
  const [dogFavoritesLoaded, setDogFavoritesLoaded] = useState(false);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [trials, setTrials] = useState<TrialData[]>([]);

  // Animation state for favorite burst effect
  const [justToggledArmband, setJustToggledArmband] = useState<number | null>(null);

  // Manual refresh state for minimum feedback duration
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Virtual scrolling ref
  const parentRef = useRef<HTMLDivElement>(null);

  // Optimistic update hook for favorites
  const { update: _performOptimisticUpdate } = useOptimisticUpdate();

  // Calculate number of columns based on viewport width
  const [columnCount, setColumnCount] = useState(1);

  // Log version on mount
  useEffect(() => {}, []);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1200) {
        setColumnCount(3); // Desktop: 3 columns
      } else if (width >= 768) {
        setColumnCount(2); // Tablet: 2 columns
      } else {
        setColumnCount(1); // Mobile: 1 column
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // ✨ React Query: Sync query data with local state and apply favorites
  useEffect(() => {
    // Update trials directly from query
    setTrials(trialsData);

    // Apply favorites to entries before setting state
    const entriesWithFavorites = entriesData.map(entry => ({
      ...entry,
      is_favorite: favoriteDogs.has(entry.armband)
    }));

    setEntries(entriesWithFavorites);
  }, [trialsData, entriesData, favoriteDogs]);

  // Load dog favorites from localStorage
  useEffect(() => {
    const loadDogFavorites = () => {
      try {
        const favoritesKey = `dog_favorites_${showContext?.licenseKey || 'default'}`;
        logger.log('🐕 Loading dog favorites with key:', favoritesKey);
        const savedFavorites = localStorage.getItem(favoritesKey);
        logger.log('🐕 Raw localStorage value for dog favorites:', savedFavorites);
        if (savedFavorites) {
          const favoriteIds = JSON.parse(savedFavorites) as number[];
          // Validate the data is an array of numbers
          if (Array.isArray(favoriteIds) && favoriteIds.every(id => typeof id === 'number')) {
            logger.log('🐕 Setting favoriteDogs from localStorage:', favoriteIds);
            setFavoriteDogs(new Set(favoriteIds));
          } else {
            logger.warn('🐕 Invalid dog favorites data in localStorage, clearing it');
            localStorage.removeItem(favoritesKey);
            setFavoriteDogs(new Set());
          }
        } else {
          logger.log('🐕 No saved dog favorites found');
          setFavoriteDogs(new Set());
        }
        setDogFavoritesLoaded(true);
      } catch (error) {
        logger.error('Error loading dog favorites from localStorage:', error);
        // Clear corrupted data
        const favoritesKey = `dog_favorites_${showContext?.licenseKey || 'default'}`;
        localStorage.removeItem(favoritesKey);
        setFavoriteDogs(new Set());
        setDogFavoritesLoaded(true);
      }
    };
    
    if (showContext?.licenseKey) {
      loadDogFavorites();
    }
  }, [showContext?.licenseKey]);

  // Save dog favorites to localStorage whenever favoriteDogs changes (but only after initial load)
  useEffect(() => {
    if (dogFavoritesLoaded) {
      try {
        const favoritesKey = `dog_favorites_${showContext?.licenseKey || 'default'}`;
        const favoriteIds = Array.from(favoriteDogs);
        logger.log('🐕 Saving dog favorites to localStorage:', favoritesKey, favoriteIds);
        localStorage.setItem(favoritesKey, JSON.stringify(favoriteIds));
        logger.log('🐕 Saved dog favorites successfully');
      } catch (error) {
        logger.error('Error saving dog favorites to localStorage:', error);
      }
    } else {
      logger.log('🐕 Not saving dog favorites - not loaded yet:', { licenseKey: showContext?.licenseKey, dogFavoritesLoaded, size: favoriteDogs.size });
    }
  }, [favoriteDogs, showContext?.licenseKey, dogFavoritesLoaded]);

  // ✨ React Query: Refresh handler with minimum feedback duration
  // Uses forceSync=true to fetch fresh data from server first
  const handleRefresh = useCallback(async () => {
    hapticFeedback.medium();
    setIsManualRefreshing(true);

    // Ensure minimum 500ms feedback so users see something happened
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));

    try {
      await Promise.all([refetch(true), minFeedbackDelay]); // forceSync=true
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch, hapticFeedback]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[Home] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isRefreshing && !isManualRefreshing,
  });

  const toggleFavorite = useCallback(async (armband: number) => {
    logger.log('🐕 toggleFavorite called for armband:', armband);
    hapticFeedback.light();

    // Trigger heart burst animation
    setJustToggledArmband(armband);
    setTimeout(() => setJustToggledArmband(null), 400);

    // Update the favoriteDogs set for localStorage persistence
    setFavoriteDogs(prev => {
      const newFavorites = new Set(prev);
      const wasAlreadyFavorite = newFavorites.has(armband);

      if (wasAlreadyFavorite) {
        newFavorites.delete(armband);
        logger.log('🐕 Removing from dog favorites:', armband);
      } else {
        newFavorites.add(armband);
        logger.log('🐕 Adding to dog favorites:', armband);
      }
      logger.log('🐕 New dog favorites set:', Array.from(newFavorites));

      // Sync with push notifications (async, non-blocking)
      import('@/services/pushNotificationService').then(async ({ default: PushNotificationService }) => {
        const isSubscribed = await PushNotificationService.isSubscribed();
        if (isSubscribed) {
          const favoriteArray = Array.from(newFavorites);
          await PushNotificationService.updateFavoriteArmbands(favoriteArray);
          logger.log('🔔 Push notifications updated with favorites:', favoriteArray);
        }
      }).catch(error => {
        logger.error('🔔 Failed to update push notification favorites:', error);
      });

      return newFavorites;
    });
  }, [hapticFeedback]);
  
  const handleDogClick = (armband: number) => {
    hapticFeedback.light();
    navigate(`/dog/${armband}`);
  };

  // Prefetch trial class data when hovering/touching trial card
  const handleTrialPrefetch = useCallback(async (trialId: number) => {
    if (!showContext?.showId || !showContext?.licenseKey) return;

    await prefetch(
      `trial-classes-${trialId}`,
      async () => {
        // Try replicated cache first (offline-first)
        try {
          const manager = await ensureReplicationManager();
          const classesTable = manager.getTable('classes');
          if (classesTable) {
            const allClasses = await classesTable.getAll() as Class[];
            const trialClasses = allClasses
              .filter(c => String(c.trial_id) === String(trialId))
              .sort((a, b) => (a.class_order || 0) - (b.class_order || 0));

            if (trialClasses.length > 0) {
              logger.log('📡 Prefetched trial classes from cache:', trialId, trialClasses.length);
              return trialClasses;
            }
          }
        } catch (error) {
          logger.error('❌ Error prefetching from cache:', error);
        }

        // Fall back to Supabase if cache miss
        const { data: classData } = await supabase
          .from('classes')
          .select('*')
          .eq('trial_id', trialId)
          .order('class_order');

        logger.log('📡 Prefetched trial classes from Supabase:', trialId, classData?.length || 0);
        return classData || [];
      },
      {
        ttl: 60, // 1 minute cache
        priority: 2 // Medium priority
      }
    );
  }, [showContext?.showId, showContext?.licenseKey, prefetch]);

  const getFilteredEntries = () => {
    // First filter by favorites if needed
    let filtered = entries;
    if (filterBy === 'favorites') {
      filtered = entries.filter(e => e.is_favorite);
    }

    // Then filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.call_name.toLowerCase().includes(search) ||
        entry.breed.toLowerCase().includes(search) ||
        entry.handler.toLowerCase().includes(search)
      );
    }

    // Finally sort by selected method
    const sorted = [...filtered];
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.call_name.localeCompare(b.call_name));
      case 'handler':
        return sorted.sort((a, b) => a.handler.localeCompare(b.handler));
      case 'armband':
      default:
        return sorted.sort((a, b) => a.armband - b.armband);
    }
  };

  // Get filtered entries for virtualization
  const filteredEntries = getFilteredEntries();

  // Prepare filter tabs for TabBar component
  const filterTabs: Tab[] = useMemo(() => [
    {
      id: 'all',
      label: 'All Dogs',
      count: entries.length
    },
    {
      id: 'favorites',
      label: 'Favorites',
      count: entries.filter(e => e.is_favorite).length
    }
  ], [entries]);

  // Prepare sort options for SearchSortControls component
  const sortOptions: SortOption[] = useMemo(() => [
    { value: 'armband', label: 'Armband' },
    { value: 'name', label: 'Dog' },
    { value: 'handler', label: 'Handler' }
  ], []);

  // Calculate row count based on columns
  const rowCount = Math.ceil(filteredEntries.length / columnCount);

  // Virtual scrolling setup - virtualize ROWS, not individual items
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 130, // Estimated height of each ROW (card min-height 85px + 16px padding + 16px gap + buffer)
    overscan: 5, // Render 5 extra rows above/below viewport for smoother scrolling
  });

  return (
    <div className="home-container">
      {/* Onboarding - Show on first visit */}
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Enhanced Header with Glass Morphism */}
      <header className="page-header home-header">
        <HamburgerMenu currentPage="home" />
        <CompactOfflineIndicator />

        <div className="header-center">
          <h1>
            <HomeIcon className="title-icon" />
            Home
          </h1>
          <p className="header-subtitle">myK9Q - Queue & Qualify</p>
        </div>

        <div className="header-buttons">
          {/* Background refresh indicator */}
          {(isRefreshing || isManualRefreshing) && <RefreshIndicator isRefreshing={isRefreshing || isManualRefreshing} />}

          {/* Filter button */}
          <FilterTriggerButton
            onClick={() => setIsFilterPanelOpen(true)}
            hasActiveFilters={searchTerm.length > 0}
          />

          <button
            className="icon-button"
            onClick={handleRefresh}
            disabled={isRefreshing || isManualRefreshing}
            aria-label="Refresh (long press for full reload)"
            title="Refresh (long press for full reload)"
            {...refreshLongPressHandlers}
          >
            <RefreshCw className={`h-5 w-5 ${(isRefreshing || isManualRefreshing) ? 'rotating' : ''}`} />
          </button>
        </div>
      </header>

      {/* PWA Install Prompt - Only shown to exhibitors with favorited dogs */}
      {role === 'exhibitor' && favoriteDogs.size > 0 && settings.enableNotifications && (
        <div style={{ padding: '0 1rem', marginTop: '0.5rem' }}>
          <InstallPrompt
            mode="banner"
            showNotificationBenefit={true}
            favoritedCount={favoriteDogs.size}
          />
        </div>
      )}

      {/* Show info moved to hamburger menu for maximum screen space */}

      {/* Pull to Refresh Wrapper */}
      <PullToRefresh
        onRefresh={handleRefresh}
        enabled
        threshold={100}
        maxPullDistance={140}
      >
      <div className="home-scrollable-content">
      {/* Enhanced Active Trials Section */}
      <div className="trials-section">
        <div className="trials-scroll">
          {trials.map((trial, index) => {
            // Determine trial status based on entry scoring (consistent with class statuses)
            const getTrialStatus = () => {
              if (trial.entries_completed === trial.entries_total && trial.entries_total > 0) {
                return 'completed'; // All entries scored
              } else if (trial.entries_completed > 0) {
                return 'active'; // Some entries scored = in-progress
              } else if (trial.entries_total > 0) {
                return 'upcoming'; // No entries scored yet but entries exist
              } else {
                return 'upcoming'; // No entries exist
              }
            };

            const trialStatus = getTrialStatus();

            return (
              <div
                key={trial.id}
                className={`trial-card ${trialStatus}`}
                onMouseEnter={() => handleTrialPrefetch(trial.id)}
                onTouchStart={() => handleTrialPrefetch(trial.id)}
                onClick={() => {
                  hapticFeedback.medium();
                  logger.log('Navigating to trial:', trial.id, 'id:', trial.id);
                  navigate(`/trial/${trial.id}/classes`);
                }}
              >
                <div className="trial-content">
                  {/* Trial Date and Number */}
                  <div className="trial-title">
                    <div className="trial-name-number">
                      <TrialDateBadge
                        date={trial.trial_date}
                        trialNumber={index + 1}
                        className="trial-icon"
                      />
                    </div>
                  </div>

                  {/* Progress Section */}
                  <div className="trial-progress">
                    <div className="progress-row">
                      <Calendar size={14}  style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                      <span>Classes Completed: {trial.classes_completed} of {trial.classes_total}</span>
                    </div>
                    <div className="progress-row">
                      <Users2 size={14} />
                      <span>Entries Scored: {trial.entries_completed} of {trial.entries_total}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab Bar for All Dogs / Favorites */}
      <TabBar
        tabs={filterTabs}
        activeTab={filterBy}
        onTabChange={(tabId) => {
          hapticFeedback.light();
          setFilterBy(tabId as 'all' | 'favorites');
        }}
      />

      {/* Enhanced Entry List Section */}
      <div className="entry-list">
        {fetchError ? (
          <ErrorState
            message={`Failed to load dashboard: ${(fetchError as Error).message || 'Please check your connection and try again.'}`}
            onRetry={handleRefresh}
            isRetrying={isRefreshing || isManualRefreshing}
          />
        ) : isLoading ? (
          <div className="loading-skeleton">
            <div className="skeleton-header">
              <div className="skeleton-text skeleton-title"></div>
            </div>
            <div className="skeleton-grid">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-card-content">
                    <div className="skeleton-avatar"></div>
                    <div className="skeleton-info">
                      <div className="skeleton-text skeleton-name"></div>
                      <div className="skeleton-text skeleton-breed"></div>
                      <div className="skeleton-text skeleton-handler"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filterBy === 'favorites' && getFilteredEntries().length === 0 ? (
          <div className="no-favorites">
            <Heart className="no-favorites-icon" />
            <h3>No Favorites Yet</h3>
            <p>Tap the heart icon on any dog to add them to your favorites</p>
          </div>
        ) : (
          <>
            {/* Virtual Scrolling Container */}
            <div
              ref={parentRef}
              className="entry-grid-virtual"
              style={{
                contain: 'strict',
              }}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  // Calculate which entries belong in this row
                  const startIndex = virtualRow.index * columnCount;
                  const endIndex = Math.min(startIndex + columnCount, filteredEntries.length);
                  const rowEntries = filteredEntries.slice(startIndex, endIndex);

                  return (
                    <div
                      key={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                        gap: '1rem',
                        padding: '0.5rem 1rem 0.5rem 1rem',
                      }}
                    >
                      {rowEntries.map((entry) => (
                        <div
                          key={entry.armband}
                          className="entry-card"
                          onClick={() => handleDogClick(entry.armband)}
                        >
                          <div className="entry-content">
                            {/* Prominent Armband */}
                            <div className="entry-armband">
                              <ArmbandBadge number={entry.armband} />
                            </div>

                            {/* Dog Details */}
                            <div className="entry-details">
                              <h4 className="entry-name">{entry.call_name}</h4>
                              <p className="entry-breed">{entry.breed}</p>
                              <p className="entry-handler">{entry.handler}</p>
                            </div>

                            {/* Actions */}
                            <div className="entry-actions">
                              <button
                                type="button"
                                className={`favorite-button ${entry.is_favorite ? 'favorited' : ''} ${justToggledArmband === entry.armband ? 'favorite-just-toggled' : ''}`}
                                onClick={(e) => {
                                  logger.log('🚨 Dog heart button clicked! Armband:', entry.armband, 'Target:', e.target);
                                  e.preventDefault();
                                  e.stopPropagation();
                                  e.nativeEvent.stopImmediatePropagation();
                                  toggleFavorite(entry.armband);
                                  return false;
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onTouchStart={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                style={{ zIndex: 15 }}
                              >
                                <Heart className="favorite-icon" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
      </div>
      </PullToRefresh>

      {/* Filter Panel - Slide-out search and sort */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search dog name, breed, handler..."
        sortOptions={sortOptions}
        sortOrder={sortBy}
        onSortChange={(value) => setSortBy(value as 'armband' | 'name' | 'handler')}
        resultsLabel={`${getFilteredEntries().length} of ${entries.length} dogs`}
      />
    </div>
  );
};