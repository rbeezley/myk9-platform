import React, { Suspense, lazy, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { BarChart3, RefreshCw, Info } from 'lucide-react';
import { PageLoader } from '../../components/LoadingSpinner';
import { HamburgerMenu } from '../../components/ui/HamburgerMenu';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import { useStatsData } from './hooks/useStatsData';
import { useStatsFilterOptions } from './hooks/useStatsFilterOptions';
import { useLongPress } from '@/hooks/useLongPress';
import { logger } from '@/utils/logger';
import type { StatsLevel, StatsFilters } from './types/stats.types';
import { OfflineFallback } from '@/components/ui';
import { ShowProgressStats } from './components/ShowProgressStats';
import { StatsSummaryCards } from './components/StatsSummaryCards';
import './Stats.css';

// Lazy load heavy chart components
const QualificationChart = lazy(() => import('./components/QualificationChart'));
const BreedPerformanceChart = lazy(() => import('./components/BreedPerformanceChart'));
const JudgePerformanceChart = lazy(() => import('./components/JudgePerformanceChart'));
const FastestTimesTable = lazy(() => import('./components/FastestTimesTable'));
const CleanSweepSection = lazy(() => import('./components/CleanSweepSection'));
const StatsFiltersComponent = lazy(() => import('./components/StatsFilters'));

export const Stats: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const { trialId } = useParams<{ trialId?: string }>();
  const { hasRole } = usePermission();

  // Check if user can see unrestricted stats (admin/judge see all, others see filtered)
  const canSeeAllStats = hasRole(['admin', 'judge']);

  // Get filter options (uses cache-first strategy)
  const filterOptions = useStatsFilterOptions({
    licenseKey: showContext?.licenseKey,
    showId: showContext?.showId,
    trialId
  });

  // Stats is now filter-based only (no route-based drill-down)
  const level: StatsLevel = 'show';

  // Parse all filters from URL params
  const filters: StatsFilters = useMemo(() => ({
    breed: searchParams.get('breed'),
    judge: searchParams.get('judge'),
    trialDate: searchParams.get('trialDate'),
    trialNumber: searchParams.get('trialNumber') ? parseInt(searchParams.get('trialNumber')!) : null,
    element: searchParams.get('element'),
    level: searchParams.get('level'),
    classId: searchParams.get('classId') ? parseInt(searchParams.get('classId')!) : null
  }), [searchParams]);

  // Fetch stats data
  // Non-admin/judge users only see times from completed classes (fair competition)
  const { data, isLoading, error, isOffline, refetch } = useStatsData({
    level,
    showId: showContext?.showId,
    filters,
    restrictTimesToCompletedClasses: !canSeeAllStats
  });

  // Manual refresh state for visible feedback
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh with minimum feedback duration
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const minFeedbackDelay = new Promise(resolve => setTimeout(resolve, 500));
    try {
      await Promise.all([refetch(), minFeedbackDelay]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Hard refresh (full page reload) - triggered by long press on refresh button
  const handleHardRefresh = useCallback(() => {
    logger.log('[Stats] Hard refresh triggered via long press');
    window.location.reload();
  }, []);

  // Long press handler for refresh button
  const refreshLongPressHandlers = useLongPress(handleHardRefresh, {
    delay: 800,
    enabled: !isLoading && !isRefreshing,
  });

  // Handle filter changes - persist to URL
  const handleFilterChange = (newFilters: Partial<StatsFilters>) => {
    const params = new URLSearchParams(searchParams);

    // Helper to set or delete a param
    const updateParam = (key: string, value: string | number | null | undefined) => {
      if (value !== undefined) {
        if (value) {
          params.set(key, String(value));
        } else {
          params.delete(key);
        }
      }
    };

    updateParam('breed', newFilters.breed);
    updateParam('judge', newFilters.judge);
    updateParam('trialDate', newFilters.trialDate);
    updateParam('trialNumber', newFilters.trialNumber);
    updateParam('element', newFilters.element);
    updateParam('level', newFilters.level);
    updateParam('classId', newFilters.classId);

    setSearchParams(params);
  };

  // Offline state - show graceful degradation message
  if (isOffline) {
    return (
      <OfflineFallback
        message="Statistics require an internet connection. Please reconnect to view analytics."
      />
    );
  }

  // Loading state
  if (isLoading) {
    return <PageLoader message="Loading statistics..." />;
  }

  // Error state
  if (error) {
    return (
      <div className="stats-error">
        <div className="error-icon">
          <BarChart3 className="h-12 w-12" />
        </div>
        <h2>Unable to Load Statistics</h2>
        <p>{error.message}</p>
        <button onClick={() => navigate(-1)} className="error-button">
          Go Back
        </button>
      </div>
    );
  }

  // No data state
  if (!data || data.totalEntries === 0) {
    return (
      <div className="stats-empty">
        <div className="empty-icon">
          <BarChart3 className="h-12 w-12" />
        </div>
        <h2>No Statistics Available</h2>
        <p>No completed classes with scored entries match your filters.</p>
        <button onClick={() => navigate(-1)} className="empty-button">
          Go Back
        </button>
      </div>
    );
  }

  // Time-based stats are now filtered at the data fetch level (see restrictTimesToCompletedClasses)
  // Non-admin/judge users only see times from completed classes to ensure fair competition

  // Get current class information for display
  const currentClass = filters.classId
    ? filterOptions.classes.find(c => c.id === filters.classId)
    : null;

  // Format class subtitle with trial info
  const formatClassSubtitle = () => {
    if (!currentClass) return '';
    const parts: string[] = [];
    if (currentClass.trialDate) {
      // Parse ISO date string without timezone conversion
      // This prevents JavaScript from converting UTC to local timezone incorrectly
      const [year, month, day] = currentClass.trialDate.split('T')[0].split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const formattedDate = date.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
      });
      parts.push(formattedDate);
    }
    if (currentClass.trialNumber !== undefined) {
      parts.push(`Trial ${currentClass.trialNumber}`);
    }
    parts.push(currentClass.name);
    return parts.join(' • ');
  };

  return (
    <div className="stats-container">
      {/* Header - consistent with other pages */}
      <header className="page-header stats-page-header">
        <HamburgerMenu />
        <div className="header-content">
          <h1>
            <BarChart3 className="title-icon" />
            Statistics
          </h1>
          {currentClass && (
            <p className="stats-class-subtitle">{formatClassSubtitle()}</p>
          )}
        </div>
        <button
          className="icon-button"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          aria-label="Refresh (long press for full reload)"
          title="Refresh (long press for full reload)"
          {...refreshLongPressHandlers}
        >
          <RefreshCw size={20} className={isRefreshing ? 'rotating' : ''} />
        </button>
      </header>

      {/* Filters Bar */}
      <div className="filters-bar">
        <Suspense fallback={<div className="filters-skeleton" />}>
          <StatsFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
            availableBreeds={[...new Set(data.breedStats.map(b => b.breed))]}
            availableJudges={[...new Set(data.judgeStats.map(j => j.judgeName).filter(Boolean) as string[])]}
            availableTrialDates={filterOptions.trialDates}
            availableTrialNumbers={filterOptions.trialNumbers}
            availableElements={filterOptions.elements}
            availableLevels={filterOptions.levels}
          />
        </Suspense>
      </div>

      {/* Info banner for non-admin/judge users */}
      {!canSeeAllStats && (
        <div className="stats-visibility-info">
          <Info size={16} />
          <span>Time statistics only include completed classes to ensure fair competition.</span>
        </div>
      )}

      {/* Show Progress Stats */}
      <ShowProgressStats trialId={trialId} />

      {/* Summary Cards */}
      <StatsSummaryCards
        data={data}
        filters={filters}
        filteredFastestTime={data.fastestTime}
      />

      {/* Charts Section */}
      <div className="stats-charts">
        {/* Qualification Distribution */}
        <div className="chart-container">
          <h2 className="chart-title">
            Result Distribution
            <span className="chart-hint-mobile">Tap segments for details</span>
          </h2>
          <Suspense fallback={<div className="chart-skeleton" />}>
            <QualificationChart data={data} onSegmentClick={handleFilterChange} />
          </Suspense>
        </div>

        {/* Judge Performance */}
        {data.judgeStats.length > 0 && (
          <div className="chart-container">
            <h2 className="chart-title">
              Performance by Judge
              <span className="chart-hint-mobile">Tap bars for details</span>
            </h2>
            <Suspense fallback={<div className="chart-skeleton" />}>
              <JudgePerformanceChart
                data={data.judgeStats}
                onBarClick={(judge) => handleFilterChange({ judge })}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Breed Performance - Full Width */}
      {/* Only show breed chart when NOT filtering by breed */}
      {data.breedStats.length > 0 && !filters.breed && (
        <div className="stats-section breed-performance-section">
          <h2 className="chart-title">
            Performance by Breed
            <span className="chart-hint-mobile">Tap bars for details</span>
          </h2>
          <div className="breed-chart-container">
            <Suspense fallback={<div className="chart-skeleton" />}>
              <BreedPerformanceChart
                data={data.breedStats}
                onBarClick={(breed) => handleFilterChange({ breed })}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Fastest Times Leaderboard */}
      {data.fastestTimes.length > 0 && (
        <div className="stats-section">
          <h2 className="section-title">Fastest Dogs</h2>
          <p className="section-subtitle">Top 20 dogs by their fastest qualifying time</p>
          <Suspense fallback={<div className="table-skeleton" />}>
            <FastestTimesTable
              data={data.fastestTimes}
              onDogClick={(armbandNumber) => navigate(`/dog/${armbandNumber}`)}
            />
          </Suspense>
        </div>
      )}

      {/* Clean Sweep Section (Show level only) */}
      {level === 'show' && data.cleanSweepDogs.length > 0 && (
        <div className="stats-section">
          <h2 className="section-title">Clean Sweep Dogs</h2>
          <p className="section-subtitle">100% qualification across all scored classes</p>
          <Suspense fallback={<div className="cards-skeleton" />}>
            <CleanSweepSection
              dogs={data.cleanSweepDogs}
              onDogClick={(armbandNumber) => navigate(`/dog/${armbandNumber}`)}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};