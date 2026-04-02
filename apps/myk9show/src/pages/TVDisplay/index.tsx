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

  const { show, classes, isLoading } = useTVData(showId ?? '', trialId);
  const { completedClasses } = useTVResults(showId ?? '', trialId);
  const { isConnected } = useTVRealtime(showId ?? '');

  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [shownPodiums, setShownPodiums] = useState<Set<string>>(new Set());
  const [highlightedClassId, setHighlightedClassId] = useState<string | null>(null);
  const prevClassesRef = useRef<string>('');
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive podium queue from completedClasses minus already-shown ones
  const podiumQueue = useMemo(
    () => completedClasses.filter(c => !shownPodiums.has(c.id)),
    [completedClasses, shownPodiums]
  );

  // Detect class card updates for highlight animation
  const classKey = useMemo(() => classes.map(c => `${c.id}:${c.scoredCount}`).join(','), [classes]);
  useEffect(() => {
    if (!prevClassesRef.current || prevClassesRef.current === classKey) {
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
    for (const c of classes) {
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
  }, [classKey, classes]);

  const handlePodiumComplete = useCallback((classId: string) => {
    setShownPodiums(prev => new Set(prev).add(classId));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
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
        <div className="text-zinc-500 text-lg">Show not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {isDesktop && podiumQueue.length > 0 && (
        <TVPodiumOverlay
          queue={podiumQueue}
          onComplete={handlePodiumComplete}
          soundEnabled={soundEnabled}
        />
      )}

      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">{show.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-zinc-500">
              {isConnected ? 'Live' : 'Reconnecting...'}
              {classes.length > 0 &&
                ` • ${classes.length} class${classes.length !== 1 ? 'es' : ''} active`}
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

      {isDesktop ? (
        <TVGrid classes={classes} highlightedClassId={highlightedClassId} />
      ) : (
        <TVMobileList classes={classes} completedClasses={completedClasses} />
      )}
    </div>
  );
}
