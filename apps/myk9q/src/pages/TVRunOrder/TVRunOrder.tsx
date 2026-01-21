import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListOrdered, Trophy } from 'lucide-react';
import { HamburgerMenu } from '../../components/ui';
import { useTVData } from './hooks/useTVData';
import { useTVResultsData } from './hooks/useTVResultsData';
import { ClassRunOrder } from './components/ClassRunOrder';
import { TVResults } from './components/TVResults';
import { cn } from '@/lib/utils';

/** Tailwind styles for TVRunOrder */
const styles = {
  container: cn(
    "flex flex-col h-screen overflow-hidden",
    "bg-[var(--secondary)] dark:bg-[var(--background)]"
  ),
  headerBar: cn(
    "relative flex-shrink-0 flex items-center gap-4",
    "px-4 py-2"
  ),
  headerBarPodium: cn(
    "relative justify-start overflow-hidden",
    "px-4 py-2",
    "bg-gradient-to-b from-[rgba(20,20,25,0.98)] to-[rgba(15,15,18,0.95)]",
    "border-b border-[rgba(212,175,55,0.15)]",
    // Light mode variant
    "light:bg-gradient-to-b light:from-[rgba(250,248,245,0.98)] light:to-[rgba(245,243,240,0.95)]",
    "light:border-b-[rgba(153,101,21,0.15)]"
  ),
  menu: "flex-shrink-0 pl-2",
  title: cn(
    "absolute left-1/2 -translate-x-1/2",
    "font-sans text-[clamp(24px,3.5vw,32px)] font-semibold",
    "text-[var(--foreground)] m-0 tracking-tight text-center"
  ),
  podiumTitle: cn(
    "absolute left-1/2 -translate-x-1/2 z-10",
    "font-serif text-[clamp(28px,4vw,36px)] font-bold",
    "text-white dark:text-white light:text-[#2D2A26]",
    "m-0 tracking-wide text-center",
    "[text-shadow:0_2px_20px_rgba(212,175,55,0.2)]",
    "before:content-['★'] before:text-[0.5em] before:text-[#d4af37] before:align-middle before:mx-3 before:opacity-80",
    "after:content-['★'] after:text-[0.5em] after:text-[#d4af37] after:align-middle after:mx-3 after:opacity-80"
  ),
  viewToggle: cn(
    "flex items-center gap-2",
    "px-3 py-1 rounded",
    "bg-[var(--color-primary)] text-white",
    "text-sm font-semibold cursor-pointer",
    "transition-opacity duration-200",
    "hover:opacity-90",
    "ml-auto mr-4"
  ),
  grid: cn(
    "flex-1 grid gap-4 p-4",
    "grid-cols-1 auto-rows-auto overflow-y-auto",
    "lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:content-start lg:overflow-hidden"
  ),
  empty: cn(
    "flex-1 flex flex-col items-center justify-center",
    "p-8 text-center"
  ),
  emptyTitle: cn(
    "text-4xl font-semibold m-0 mb-4",
    "text-[var(--foreground)]"
  ),
  emptyText: "text-2xl text-[var(--muted-foreground)] m-0",
  error: cn(
    "flex-1 flex flex-col items-center justify-center",
    "p-8 text-center"
  ),
  errorTitle: cn(
    "text-4xl font-semibold m-0 mb-4",
    "text-[var(--destructive)]"
  ),
  errorText: "text-xl text-[var(--muted-foreground)] m-0",
  pagination: cn(
    "flex-shrink-0 flex items-center justify-center gap-4",
    "px-4 py-2 bg-transparent"
  ),
  paginationBtn: cn(
    "w-8 h-8 rounded-full flex items-center justify-center",
    "bg-[var(--muted)] text-[var(--muted-foreground)]",
    "border border-[var(--border)] cursor-pointer",
    "transition-all duration-150",
    "hover:bg-[var(--primary)] hover:text-white hover:border-[var(--primary)]",
    "active:scale-95"
  ),
  paginationInfo: cn(
    "text-sm font-medium text-[var(--muted-foreground)]",
    "min-w-[50px] text-center"
  ),
};

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
      <div className={styles.container}>
        <div className={styles.error}>
          <h1 className={styles.errorTitle}>Error Loading Run Order</h1>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  // Empty state - show results if no run order
  if (inProgressClasses.length === 0) {
    // If we have results, show them instead of empty state
    if (completedClasses.length > 0) {
      return (
        <div className={styles.container}>
          <div className={cn(styles.headerBar, styles.headerBarPodium)}>
            <div className={styles.menu}>
              <HamburgerMenu currentPage="tv" />
            </div>
            <h1 className={styles.podiumTitle}>The Podium</h1>
          </div>
          <TVResults classes={visibleResults} />

          {/* Page navigation if more than 6 results */}
          {completedClasses.length > 6 && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={goToPreviousResultsPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className={styles.paginationInfo}>
                {resultsPage + 1} / {resultsTotalPages}
              </span>
              <button
                className={styles.paginationBtn}
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
      <div className={styles.container}>
        <div className={styles.headerBar}>
          <div className={styles.menu}>
            <HamburgerMenu currentPage="tv" />
          </div>
        </div>
        <div className={styles.empty}>
          <h1 className={styles.emptyTitle}>No Classes Available</h1>
          <p className={styles.emptyText}>Classes will appear here when they are about to start or in progress.</p>
        </div>
      </div>
    );
  }

  // Determine if we should show view toggle
  const showViewToggle = completedClasses.length > 0;

  return (
    <div className={styles.container}>
      {/* Header bar with hamburger menu and view toggle */}
      <div className={cn(styles.headerBar, viewMode === 'results' && styles.headerBarPodium)}>
        <div className={styles.menu}>
          <HamburgerMenu currentPage="tv" />
        </div>

        {/* Show title based on view mode */}
        {viewMode === 'results' ? (
          <h1 className={styles.podiumTitle}>The Podium</h1>
        ) : (
          <h1 className={styles.title}>Run Order</h1>
        )}

        {/* View mode toggle button */}
        {showViewToggle && (
          <button
            className={styles.viewToggle}
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
          <div className={styles.grid}>
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
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={goToPreviousRunOrderPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className={styles.paginationInfo}>
                {runOrderPage + 1} / {runOrderTotalPages}
              </span>
              <button
                className={styles.paginationBtn}
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
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={goToPreviousResultsPage}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className={styles.paginationInfo}>
                {resultsPage + 1} / {resultsTotalPages}
              </span>
              <button
                className={styles.paginationBtn}
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
