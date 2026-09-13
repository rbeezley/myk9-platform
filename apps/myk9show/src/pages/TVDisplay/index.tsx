import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Maximize, Minimize } from 'lucide-react';
import { useTVData } from './useTVData';
import { useTVResults } from './useTVResults';
import { useTVRealtime } from './useTVRealtime';
import { TVGrid } from './TVGrid';
import { TVPodiumOverlay } from './TVPodiumOverlay';
import { TVMobileList } from './TVMobileList';
import { TVSoundToggle } from './TVSoundToggle';
import { TVEmptyState } from './TVEmptyState';
import { TVRefreshNotice } from './TVRefreshNotice';

// INTENT: TVDisplay is a fixed-dark venue screen, not an app-themed page. The
// literal zinc/green/red colors are tuned for projected or wall-mounted displays
// and should not inherit user light/dark mode.

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function TVDisplay() {
  const { showId } = useParams<{ showId: string }>();
  const [searchParams] = useSearchParams();
  const trialId = searchParams.get('trial') ?? undefined;

  const { show, classes, isLoading, error: dataError } = useTVData(showId ?? '', trialId);
  const { completedClasses, error: resultsError } = useTVResults(showId ?? '', trialId);
  const { isConnected } = useTVRealtime(showId ?? '');

  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [shownPodiums, setShownPodiums] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(`tv-shown-podiums-${showId}`);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [highlightedClassId, setHighlightedClassId] = useState<string | null>(null);
  const prevClassesRef = useRef<string>('');
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync fullscreen state with browser (handles Escape key)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Clean up highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const { displayClasses, displayableCompletedClasses } = useMemo(() => {
    const released = completedClasses.filter(c => c.placements.length > 0);
    const activeVersions = new Map(classes.map(c => [c.id, c.version]));
    // Compare the class row's server version, not query completion time: either
    // request can finish last with an older snapshot during finalization/reopen.
    const displayableCompletedClasses = released.filter(
      c => (activeVersions.get(c.id) ?? 0) <= c.version
    );
    const completedIds = new Set(displayableCompletedClasses.map(c => c.id));
    return {
      displayClasses: classes.filter(c => !completedIds.has(c.id)),
      displayableCompletedClasses,
    };
  }, [classes, completedClasses]);

  // Derive podium queue from displayable results minus already-shown ones
  const podiumQueue = useMemo(
    () => displayableCompletedClasses.filter(c => !shownPodiums.has(c.id)),
    [displayableCompletedClasses, shownPodiums]
  );
  const hasRefreshError = Boolean(dataError || resultsError);
  const podiumVisible = isDesktop && podiumQueue.length > 0;
  const showRefreshNotice =
    hasRefreshError && (displayClasses.length > 0 || displayableCompletedClasses.length > 0);

  // Detect class card updates for highlight animation
  const classKey = useMemo(
    () => displayClasses.map(c => `${c.id}:${c.scoredCount}`).join(','),
    [displayClasses]
  );
  useEffect(() => {
    if (!prevClassesRef.current || prevClassesRef.current === classKey || !classKey) {
      prevClassesRef.current = classKey;
      return;
    }
    const prevMap = new Map(
      prevClassesRef.current.split(',').map(s => {
        const [id, count] = s.split(':');
        return [id, count];
      })
    );
    prevClassesRef.current = classKey;
    let changedId: string | null = null;
    for (const c of displayClasses) {
      if (prevMap.get(c.id) !== String(c.scoredCount)) {
        changedId = c.id;
        break;
      }
    }
    if (!changedId) return;
    // Schedule state update outside synchronous effect body
    const rafId = requestAnimationFrame(() => {
      setHighlightedClassId(changedId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedClassId(null), 1200);
    });
    return () => cancelAnimationFrame(rafId);
  }, [classKey, displayClasses]);

  const handlePodiumComplete = useCallback(
    (classId: string) => {
      setShownPodiums(prev => {
        const next = new Set(prev).add(classId);
        try {
          sessionStorage.setItem(`tv-shown-podiums-${showId}`, JSON.stringify([...next]));
        } catch {
          /* sessionStorage unavailable */
        }
        return next;
      });
    },
    [showId]
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-lg">Loading TV display...</div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        {dataError ? (
          <TVEmptyState showName="this show" showId={showId} error={dataError} />
        ) : (
          <div className="text-zinc-500 text-lg">Show not found</div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {podiumVisible && (
        <TVPodiumOverlay
          queue={podiumQueue}
          onComplete={handlePodiumComplete}
          soundEnabled={soundEnabled}
          refreshFailed={showRefreshNotice}
        />
      )}

      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">{show.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${!isConnected ? 'bg-red-500' : hasRefreshError ? 'bg-amber-500' : 'bg-green-500'}`}
            />
            <span className="text-zinc-500">
              {!isConnected
                ? hasRefreshError
                  ? 'Reconnecting... • Updates delayed'
                  : 'Reconnecting...'
                : hasRefreshError
                  ? 'Updates delayed'
                  : 'Live'}
              {displayClasses.length > 0 &&
                ` • ${displayClasses.length} class${displayClasses.length !== 1 ? 'es' : ''} active`}
            </span>
          </div>
          <TVSoundToggle enabled={soundEnabled} onToggle={() => setSoundEnabled(s => !s)} />
          {isDesktop && (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
        </div>
      </header>

      {showRefreshNotice && !podiumVisible && (
        <div className="px-4 pt-3">
          <TVRefreshNotice />
        </div>
      )}

      {isDesktop ? (
        <TVGrid
          classes={displayClasses}
          completedClasses={displayableCompletedClasses}
          highlightedClassId={highlightedClassId}
          showName={show.name}
          showId={show.id}
          error={dataError ?? resultsError}
        />
      ) : (
        <TVMobileList
          classes={displayClasses}
          completedClasses={displayableCompletedClasses}
          showName={show.name}
          showId={show.id}
          error={dataError ?? resultsError}
        />
      )}
    </div>
  );
}
