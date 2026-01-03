// src/pages/Results/Results.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useResultsData } from './hooks/useResultsData';
import { ResultsFilters } from './components/ResultsFilters';
import { PodiumCard } from '../../components/podium';
import { HamburgerMenu } from '../../components/ui';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';
import './Results.css';

export function Results() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showContext, role } = useAuth();
  const [pendingExpanded, setPendingExpanded] = useState(false);

  // Get optional trialId from URL if provided (for filtering to specific trial)
  const trialIdParam = searchParams.get('trialId');
  const trialId = trialIdParam ? parseInt(trialIdParam, 10) : undefined;

  const {
    completedClasses,
    pendingClasses,
    trials,
    isLoading,
    error,
    filters,
    setFilters,
    refetch,
  } = useResultsData({
    trialId,
    showId: showContext?.showId,
    userRole: role || 'exhibitor',
  });

  // Sync filters with URL
  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    const params = new URLSearchParams(searchParams);

    // Sync trial filter
    if (newFilters.trial) {
      params.set('trialId', String(newFilters.trial));
    } else {
      params.delete('trialId');
    }

    // Sync element filter
    if (newFilters.element) {
      params.set('element', newFilters.element);
    } else {
      params.delete('element');
    }

    // Sync level filter
    if (newFilters.level) {
      params.set('level', newFilters.level);
    } else {
      params.delete('level');
    }

    setSearchParams(params);
  };

  // Initialize filters from URL params on mount
  useEffect(() => {
    const urlElement = searchParams.get('element');
    const urlLevel = searchParams.get('level');

    // Only update if URL has params that differ from current filters
    if (
      (urlElement && filters.element !== urlElement) ||
      (urlLevel && filters.level !== urlLevel)
    ) {
      setFilters({
        ...filters,
        element: urlElement,
        level: urlLevel,
      });
    }
    // Only run on mount - searchParams is stable from useSearchParams
  }, [searchParams, setFilters]);

  if (!showContext?.showId) {
    return (
      <div className="results-page results-page--empty">
        <div className="tv-runorder-header-bar">
          <div className="tv-runorder-menu">
            <HamburgerMenu currentPage="results" />
          </div>
        </div>
        <div className="results-page__empty">
          <span className="results-page__empty-icon">🔐</span>
          <h2>Authentication Required</h2>
          <p>Please log in to view results.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-page">
      <header className="results-page__header">
        <div className="results-page__header-menu">
          <HamburgerMenu currentPage="results" />
        </div>
        <h1 className="results-page__header-title">The Podium</h1>
        <div className="results-page__header-spacer" />
      </header>

      <ResultsFilters
        filters={filters}
        trials={trials}
        onFilterChange={handleFilterChange}
        resultCount={completedClasses.length}
      />

      <main className="results-page__content">
        {isLoading && (
          <div className="results-page__loading">Loading results...</div>
        )}

        {error && (
          <div className="results-page__error">
            Error loading results. <button onClick={refetch}>Retry</button>
          </div>
        )}

        {!isLoading && !error && completedClasses.length === 0 && (
          <div className="results-page__empty">
            <span className="results-page__empty-icon">🏁</span>
            <h2>No results available yet</h2>
            <p>Results will appear here as classes complete scoring.</p>
          </div>
        )}

        {!isLoading && !error && completedClasses.length > 0 && (
          <div className="results-page__grid">
            {completedClasses.map((cls) => (
              <PodiumCard
                key={cls.classId}
                className={cls.className}
                element={cls.element}
                level={cls.level}
                section={cls.section}
                placements={cls.placements}
                animate={true}
              />
            ))}
          </div>
        )}

        {/* Pending Results Section - Collapsed by default */}
        {!isLoading && !error && pendingClasses.length > 0 && (
          <div className="results-page__pending-section">
            <button
              className="results-page__pending-header"
              onClick={() => setPendingExpanded(!pendingExpanded)}
              aria-expanded={pendingExpanded}
            >
              <span className="results-page__pending-toggle">
                {pendingExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </span>
              <Clock size={16} className="results-page__pending-icon" />
              <span className="results-page__pending-title">
                Pending Results
              </span>
              <span className="results-page__pending-count">
                {pendingClasses.length} {pendingClasses.length === 1 ? 'class' : 'classes'}
              </span>
            </button>

            {pendingExpanded && (
              <div className="results-page__pending-list">
                {pendingClasses.map((cls) => (
                  <div key={cls.classId} className="results-page__pending-item">
                    {cls.className}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
