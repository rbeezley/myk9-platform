import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListOrdered, Trophy } from 'lucide-react';
import { HamburgerMenu } from '../../components/ui';
import { useTVData } from './hooks/useTVData';
import { useTVResultsData } from './hooks/useTVResultsData';
import { ClassRunOrder } from './components/ClassRunOrder';
import { TVResults } from './components/TVResults';
import './TVRunOrder.css';

type ViewMode = 'runorder' | 'results';

export const TVRunOrder: React.FC = () => {
  const { licenseKey } = useParams<{ licenseKey: string }>();
  const [runOrderPage, setRunOrderPage] = useState(0);
  const [resultsPage, setResultsPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('runorder');

  // Get real-time TV dashboard data
  const {
    inProgressClasses,
    entriesByClass,
    isConnected: _isConnected,
    error
  } = useTVData({
    licenseKey: licenseKey || '',
    enablePolling: true,
    pollingInterval: 30000
  });

  // Get completed class results (fetch up to 18 for 3 pages)
  const {
    completedClasses,
    isLoading: _resultsLoading,
    error: _resultsError
  } = useTVResultsData({
    licenseKey: licenseKey || '',
    enablePolling: true,
    pollingInterval: 60000,
    maxResults: 18
  });

  // Auto-rotate between views (run order and results) every 30 seconds
  // Only if we have both run order data and results
  useEffect(() => {
    const hasRunOrder = inProgressClasses.length > 0;
    const hasResults = completedClasses.length > 0;

    if (hasRunOrder && hasResults) {
      const interval = setInterval(() => {
        setViewMode(prev => prev === 'runorder' ? 'results' : 'runorder');
      }, 30000); // 30 seconds per view

      return () => clearInterval(interval);
    }
  }, [inProgressClasses.length, completedClasses.length]);

  // Calculate total pages (6 classes per page: 3 columns × 2 rows)
  const runOrderTotalPages = Math.ceil(inProgressClasses.length / 6);
  const resultsTotalPages = Math.ceil(completedClasses.length / 6);

  // Reset run order page when class count changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunOrderPage(0);
  }, [inProgressClasses.length]);

  // Reset results page when results count changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResultsPage(0);
  }, [completedClasses.length]);

  // Run Order navigation handlers
  const goToPreviousRunOrderPage = useCallback(() => {
    setRunOrderPage(prev => (prev === 0 ? runOrderTotalPages - 1 : prev - 1));
  }, [runOrderTotalPages]);

  const goToNextRunOrderPage = useCallback(() => {
    setRunOrderPage(prev => (prev + 1) % runOrderTotalPages);
  }, [runOrderTotalPages]);

  // Results navigation handlers
  const goToPreviousResultsPage = useCallback(() => {
    setResultsPage(prev => (prev === 0 ? resultsTotalPages - 1 : prev - 1));
  }, [resultsTotalPages]);

  const goToNextResultsPage = useCallback(() => {
    setResultsPage(prev => (prev + 1) % resultsTotalPages);
  }, [resultsTotalPages]);

  // Auto-rotation if more than 6 classes in progress
  useEffect(() => {
    if (inProgressClasses.length <= 6) {
      return;
    }

    const interval = setInterval(() => {
      goToNextRunOrderPage();
    }, 45000); // 45 seconds per page

    return () => clearInterval(interval);
  }, [inProgressClasses.length, goToNextRunOrderPage]);

  // Get visible classes for current page (max 6: 3 columns × 2 rows)
  const visibleClasses = inProgressClasses.slice(
    runOrderPage * 6,
    runOrderPage * 6 + 6
  );

  // Get visible results for current page
  const visibleResults = completedClasses.slice(
    resultsPage * 6,
    resultsPage * 6 + 6
  );

  // Toggle view mode handler (must be before early returns for hooks rules)
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'runorder' ? 'results' : 'runorder');
  }, []);

  // Error state
  if (error) {
    return (
      <div className="tv-runorder-container">
        <div className="tv-runorder-error">
          <h1>Error Loading Run Order</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Empty state - show results if no run order
  if (inProgressClasses.length === 0) {
    // If we have results, show them instead of empty state
    if (completedClasses.length > 0) {
      return (
        <div className="tv-runorder-container">
          <div className="tv-runorder-header-bar tv-runorder-header-bar--podium">
            <div className="tv-runorder-menu">
              <HamburgerMenu currentPage="tv" />
            </div>
            <h1 className="tv-runorder-podium-title">The Podium</h1>
          </div>
          <TVResults classes={visibleResults} />

          {/* Page navigation if more than 6 results */}
          {completedClasses.length > 6 && (
            <div className="tv-runorder-pagination">
              <button
                className="pagination-nav-btn"
                onClick={goToPreviousResultsPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="pagination-info">
                {resultsPage + 1} / {resultsTotalPages}
              </span>
              <button
                className="pagination-nav-btn"
                onClick={goToNextResultsPage}
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="tv-runorder-container">
        <div className="tv-runorder-header-bar">
          <div className="tv-runorder-menu">
            <HamburgerMenu currentPage="tv" />
          </div>
        </div>
        <div className="tv-runorder-empty">
          <h1>No Classes Available</h1>
          <p>Classes will appear here when they are about to start or in progress.</p>
        </div>
      </div>
    );
  }

  // Determine if we should show view toggle
  const showViewToggle = completedClasses.length > 0;

  return (
    <div className="tv-runorder-container">
      {/* Header bar with hamburger menu and view toggle */}
      <div className={`tv-runorder-header-bar ${viewMode === 'results' ? 'tv-runorder-header-bar--podium' : ''}`}>
        <div className="tv-runorder-menu">
          <HamburgerMenu currentPage="tv" />
        </div>

        {/* Show title based on view mode */}
        {viewMode === 'results' ? (
          <h1 className="tv-runorder-podium-title">The Podium</h1>
        ) : (
          <h1 className="tv-runorder-title">Run Order</h1>
        )}

        {/* View mode toggle button */}
        {showViewToggle && (
          <button
            className="tv-runorder-view-toggle"
            onClick={toggleViewMode}
            aria-label={viewMode === 'runorder' ? 'Switch to Results' : 'Switch to Run Order'}
          >
            {viewMode === 'runorder' ? (
              <>
                <Trophy size={20} />
                <span>Results</span>
              </>
            ) : (
              <>
                <ListOrdered size={20} />
                <span>Run Order</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* View content based on mode */}
      {viewMode === 'runorder' ? (
        <>
          {/* 2x2 grid of in-progress classes */}
          <div className="tv-runorder-grid">
            {visibleClasses.map((classInfo) => {
              // Build the lookup key - for combined Novice A & B, use "Novice" without section
              const lookupKey = `${classInfo.trial_date}-${classInfo.trial_number}-${classInfo.element_type}-${classInfo.level}`;
              return (
                <ClassRunOrder
                  key={classInfo.id}
                  classInfo={classInfo}
                  entries={entriesByClass?.[lookupKey] || []}
                />
              );
            })}
          </div>

          {/* Page navigation if more than 6 classes */}
          {inProgressClasses.length > 6 && (
            <div className="tv-runorder-pagination">
              <button
                className="pagination-nav-btn"
                onClick={goToPreviousRunOrderPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="pagination-info">
                {runOrderPage + 1} / {runOrderTotalPages}
              </span>
              <button
                className="pagination-nav-btn"
                onClick={goToNextRunOrderPage}
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <TVResults classes={visibleResults} />

          {/* Page navigation if more than 6 results */}
          {completedClasses.length > 6 && (
            <div className="tv-runorder-pagination">
              <button
                className="pagination-nav-btn"
                onClick={goToPreviousResultsPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="pagination-info">
                {resultsPage + 1} / {resultsTotalPages}
              </span>
              <button
                className="pagination-nav-btn"
                onClick={goToNextResultsPage}
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
