import { useState, useEffect, useMemo, useRef } from 'react';
import { classScoringRules } from './classScoringRules';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { ScoresheetLoadingSkeleton } from '@/components/scoring/ScoringLoadingSkeletons';
import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { loadEntriesWithDogs } from './paperScoresheetData';
import {
  hasClassesReplicaSynced,
  requireClassEntriesWhole,
  whenClassShowSyncSettles,
} from './paperScoresheetReadiness';
import { ShowEntriesNotSyncedError } from '@/services/database/entries/requireShowEntriesSynced';
import { REFRESH_FAILED_MESSAGE, refreshEntriesAfterSave } from './paperScoresheetReload';
import { type ScoresheetSportType } from '@myk9/scoring-ui';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOptionalReplicationSync } from '@/hooks/useOptionalReplicationSync';
import {
  calculatePlacements,
  mapSportType,
  resolveSportTypeForClass,
  toRegistryKey,
} from './types';
import { usePaperScoring } from './hooks/usePaperScoring';
import { SessionToolbar } from './components/SessionToolbar';
import { SplitPanelView } from './components/SplitPanelView';
import { SequentialView } from './components/SequentialView';
import { ViewModeToggle } from './components/ViewModeToggle';
import { sortByExhibitorOrder } from './paper-scoring-types';
import { cn } from '@/lib/utils';
import type { ScoringEntry } from './types';
import type { PaperResult, PaperScoringMode } from './paper-scoring-types';
import { logger } from '@/services/LoggingService';

function getClassDetailsHref({
  showId,
  trialId,
  classId,
}: {
  showId?: string | undefined;
  trialId?: string | undefined;
  classId?: string | undefined;
}): string | null {
  if (!classId) return null;
  if (showId && trialId) return `/shows/${showId}/trials/${trialId}/classes/${classId}`;
  return `/classes/${classId}`;
}

/** The next dog to score after `from`, in exhibitor order. */
function nextUnscoredAfter(entries: ScoringEntry[], from: string): string | null {
  return (
    sortByExhibitorOrder(entries).find(e => !e.isScored && e.entryId !== from)?.entryId ?? null
  );
}

export function PaperScoresheetPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const breadcrumb = useScoringBreadcrumb(classId);
  const requestedEntryId = searchParams.get('entryId');
  const requestedMode = searchParams.get('mode');
  const appliedRequestRef = useRef<string | null>(null);

  const [entries, setEntries] = useState<ScoringEntry[]>([]);
  const [className, setClassName] = useState<string | null>(null);
  // Undefined for multi-area classes: the paper form has one total-time field,
  // and the per-area limits do not compare against a total.
  const [maxTimeSeconds, setMaxTimeSeconds] = useState<number | undefined>(undefined);
  // Registry of the class, for registry-specific scoring help (the DQ trigger rule).
  const [sportKey, setSportKey] = useState<ScoresheetSportType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A background reload that failed: the last good list (and any unsaved
  // entry) stays on screen with this note, never the error state.
  const [refreshFailed, setRefreshFailed] = useState(false);
  // A write that failed, named by its dog, so it stays visible whichever dog
  // is on screen (MYK9-1246).
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = () => setLoadAttempt(attempt => attempt + 1);
  // Counts class loads that read successfully. A save-and-next whose refresh
  // failed records the dog it left and the count it was waiting past; the next
  // successful load completes the advance, however the page was opened
  // (MYK9-774).
  const [freshLoads, setFreshLoads] = useState(0);
  const pendingAdvanceRef = useRef<{ from: string; afterLoad: number } | null>(null);
  // The current load effect's quiet reload, for signals outside the replicas.
  const quietReloadRef = useRef<(() => void) | null>(null);
  const classesSyncStatus = useOptionalReplicationSync()?.status.tablesStatus.classes;

  useEffect(() => {
    // A retry or a replica change can overlap an earlier load; only the latest
    // may write (MYK9-774).
    let disposed = false;
    let latest = 0;
    // The page's own load may be waiting on the cold sync, which writes rows
    // (notifying) BEFORE it records the scope as synced. A reload on that
    // notification would read "not synced" and overrule it, so a change during
    // that load is replayed once it finishes instead.
    let refreshing = false;
    let changedWhileRefreshing = false;
    // A class not yet on a cold device: its arrival is a replica change, so the
    // reload it starts gets the one bounded show sync the page's own load
    // could not give it (MYK9-1130).
    let awaitingClass = false;
    // `refresh`: the page's own load (mount, Try again) shows the skeleton and
    // may sync a cold show; a reload on a replica change does neither.
    async function load(refresh: boolean) {
      if (!classId) return;
      const run = ++latest;
      const cancelled = () => disposed || run !== latest;
      let syncing = refresh;
      if (refresh) {
        refreshing = true;
        setIsLoading(true);
        setError(null);
        setRefreshFailed(false);
      }
      // Only the page's own load and Try again may replace a scoresheet with an
      // error; a background reload that fails keeps what is shown (MYK9-1130).
      // An error screen has no list or draft to protect, so a background
      // reload's newer answer replaces it.
      const fail = (message: string) => {
        if (refresh) setError(message);
        else {
          setError(current => (current === null ? null : message));
          setRefreshFailed(true);
        }
      };
      let trialId: string | undefined;
      try {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (cancelled()) return;
        if (!cls) {
          // Absent from a classes replica that never synced is "not loaded
          // yet"; only a synced replica can say "not found" (MYK9-1130).
          if (!(await hasClassesReplicaSynced())) {
            awaitingClass = true;
            throw new ShowEntriesNotSyncedError();
          }
          if (!cancelled()) fail('Class not found');
          return;
        }
        trialId = cls.trialId;
        if (awaitingClass && !syncing) {
          // Hold change reloads like the page's own load, so the sync's own
          // row writes replay after it instead of overruling it.
          syncing = true;
          refreshing = true;
        }
        // An empty read is only "no dogs" once the show's entries have synced
        // here; before that it is "not loaded yet" (MYK9-1130). The arrival
        // allowance is spent only once the show can be named.
        await requireClassEntriesWhole(cls.trialId, {
          refresh: () => {
            const allowed = refresh || awaitingClass;
            awaitingClass = false;
            return allowed;
          },
        });
        const scoringEntries = await loadEntriesWithDogs(classId);
        if (cancelled()) return;
        setError(null);
        setRefreshFailed(false);
        setEntries(calculatePlacements(scoringEntries));
        setFreshLoads(count => count + 1);
        setClassName(cls.name);
        const derivedSport = await resolveSportTypeForClass(cls.trialId);
        if (cancelled()) return;
        if (derivedSport) {
          const { organization, sportType } = mapSportType(derivedSport);
          setSportKey(toRegistryKey(organization, sportType));
        }
        const rules = classScoringRules(cls);
        setMaxTimeSeconds(rules.areaCount > 1 ? undefined : rules.maxTimeSeconds);
      } catch (err) {
        if (cancelled()) return;
        fail(err instanceof Error ? err.message : 'Failed to load');
        if (err instanceof ShowEntriesNotSyncedError) recheckWhenSyncSettles(trialId);
      } finally {
        if (!cancelled()) setIsLoading(false);
        if (syncing) {
          refreshing = false;
          if (changedWhileRefreshing && !disposed) onReplicaChange();
        }
      }
    }
    // A sync that outlived the bounded wait records the scope as synced
    // without notifying; recheck when it settles. Starts no sync.
    function recheckWhenSyncSettles(trialId: string | undefined) {
      void whenClassShowSyncSettles(trialId)
        .then(settled => {
          if (settled && !disposed) onReplicaChange();
        })
        .catch(() => undefined);
    }
    function onReplicaChange() {
      changedWhileRefreshing = refreshing;
      if (!refreshing) void load(false);
    }
    // Subscribed before the first read, so rows a sync writes while it runs
    // still reload the list: entries arriving after mount appear by themselves.
    // Trials too: a class whose trial has not synced yet cannot name its show,
    // and the trial landing is what lets readiness pass. Classes too: on a
    // cold device the class itself lands after mount (MYK9-1130).
    const unsubscribeClasses = replicatedClassesTable.subscribe(onReplicaChange, {
      emitCurrent: false,
    });
    const unsubscribeEntries = replicatedEntriesTable.subscribe(onReplicaChange, {
      emitCurrent: false,
    });
    const unsubscribeTrials = replicatedTrialsTable.subscribe(onReplicaChange, {
      emitCurrent: false,
    });
    quietReloadRef.current = onReplicaChange;
    void load(true);
    return () => {
      disposed = true;
      quietReloadRef.current = null;
      unsubscribeClasses();
      unsubscribeEntries();
      unsubscribeTrials();
    };
  }, [classId, loadAttempt]);

  // Recording a completed classes sync notifies no replica listener, so a class
  // the synced replica lacks would stay "not finished loading". The provider
  // reporting the classes table settled rechecks once (MYK9-1130).
  useEffect(() => {
    if (classesSyncStatus === 'success') quietReloadRef.current?.();
  }, [classesSyncStatus]);

  const userId = user?.id ?? 'anonymous';
  const scoring = usePaperScoring(entries, userId);
  const scoringMode = scoring.mode;
  const setScoringMode = scoring.setMode;
  const sortedEntries = useMemo(() => sortByExhibitorOrder(entries), [entries]);
  // The one dog on screen: the card in card mode, the open panel's dog in list
  // mode. Every save and clear writes to exactly this dog (MYK9-1130).
  const onScreenEntryId = scoring.onScreenEntryId;
  const sequentialIndex = Math.max(
    0,
    sortedEntries.findIndex(entry => entry.entryId === onScreenEntryId)
  );

  useEffect(() => {
    if (requestedMode !== 'split' && requestedMode !== 'sequential') return;
    if (scoringMode === requestedMode) return;
    setScoringMode(requestedMode);
  }, [requestedMode, scoringMode, setScoringMode]);

  useEffect(() => {
    if (!requestedEntryId || appliedRequestRef.current === requestedEntryId) return;
    if (!entries.some(entry => entry.entryId === requestedEntryId)) return;
    scoring.selectEntry(requestedEntryId);
    appliedRequestRef.current = requestedEntryId;
  }, [entries, requestedEntryId, scoring]);

  useEffect(() => {
    const pending = pendingAdvanceRef.current;
    if (!pending || freshLoads <= pending.afterLoad) return;
    pendingAdvanceRef.current = null;
    scoring.selectEntry(nextUnscoredAfter(entries, pending.from) ?? pending.from);
  }, [entries, freshLoads, scoring]);

  // After a landed save: a list that cannot refresh pauses scoring rather than
  // letting the judge act on stale rows (MYK9-774).
  const reloadEntries = async (): Promise<ScoringEntry[] | null> => {
    if (!classId) return entries;
    const fresh = await refreshEntriesAfterSave(classId);
    if (fresh) setEntries(fresh);
    else setError(REFRESH_FAILED_MESSAGE);
    return fresh;
  };

  // A rejected write is said out loud in plain words, naming the dog, never left as an
  // unhandled rejection. On a failed save the page neither reloads nor
  // advances, so the panel keeps what was typed for a retry (MYK9-1246).
  const tryWrite = async (
    entryId: string,
    action: string,
    write: () => Promise<void>
  ): Promise<boolean> => {
    setSaveError(null);
    try {
      await write();
      return true;
    } catch (err) {
      logger.error(`${action}:`, 'pages', { entryId }, err as Error);
      const entry = entries.find(e => e.entryId === entryId);
      const dog = entry ? `${entry.armband} ${entry.callName}` : 'this dog';
      setSaveError(`${action} for ${dog}. Please try again.`);
      return false;
    }
  };

  const trySave = (
    entryId: string,
    result: PaperResult,
    timeDigits: string,
    faults: number,
    reason?: string
  ) =>
    tryWrite(entryId, 'Score not saved', () =>
      scoring.saveEntry(entryId, result, timeDigits, faults, reason)
    );

  const handleSave = async (
    result: PaperResult,
    timeDigits: string,
    faults: number,
    reason?: string
  ) => {
    const entryId = onScreenEntryId;
    if (!entryId) return;
    if (!(await trySave(entryId, result, timeDigits, faults, reason))) return;
    await reloadEntries();
  };

  const handleSaveAndNext = async (
    result: PaperResult,
    timeDigits: string,
    faults: number,
    reason?: string
  ) => {
    const currentEntryId = onScreenEntryId;
    if (!currentEntryId) return;
    if (!(await trySave(currentEntryId, result, timeDigits, faults, reason))) return;
    const fresh = await reloadEntries();
    if (!fresh) {
      pendingAdvanceRef.current = { from: currentEntryId, afterLoad: freshLoads };
      return;
    }
    // With no dog left to score, the saved dog stays on screen.
    scoring.selectEntry(nextUnscoredAfter(fresh, currentEntryId) ?? currentEntryId);
  };

  const handleClearResult = async () => {
    const entryId = onScreenEntryId;
    if (!entryId) return;
    // A failed clear still reloads, so the list shows the score that stayed.
    const cleared = await tryWrite(entryId, 'Result not cleared', () =>
      scoring.clearEntry(entryId)
    );
    await reloadEntries();
    return cleared;
  };

  const handleModeChange = (mode: PaperScoringMode) => {
    scoring.setMode(mode);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('mode', mode);
    setSearchParams(nextParams, { replace: true });
  };

  if (isLoading) {
    return <ScoresheetLoadingSkeleton label="Loading paper scoresheet" />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={retryLoad}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const scoredCount = entries.filter(e => e.isScored).length;
  const classDetailsHref = getClassDetailsHref(breadcrumb);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-2">
        <ShowDeskReturnLink showId={breadcrumb.showId ?? undefined} />
      </div>
      {!breadcrumb.isLoading && (
        <div className="px-4 pt-4">
          <Breadcrumb
            items={[
              ...(breadcrumb.showName
                ? [{ label: breadcrumb.showName, href: `/shows/${breadcrumb.showId}` }]
                : []),
              ...(breadcrumb.trialLabel
                ? [{ label: breadcrumb.trialLabel, href: `/shows/${breadcrumb.showId}` }]
                : []),
              { label: className ?? 'Class', isCurrentPage: true },
            ]}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="text-xl font-bold">{className ?? 'Score Entry'}</h1>
          <p className="text-sm text-muted-foreground">
            {scoredCount} of {entries.length} scored
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (classDetailsHref) navigate(classDetailsHref);
              else navigate(-1);
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Class</span>
            <span className="sm:hidden">Class</span>
          </Button>
          <ViewModeToggle mode={scoring.mode} onChange={handleModeChange} />
        </div>
      </div>

      <SessionToolbar settings={scoring.sessionSettings} onChange={scoring.setSessionSettings} />

      {saveError && (
        <div
          role="alert"
          className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="ml-auto underline">
            Dismiss
          </button>
        </div>
      )}

      {refreshFailed && (
        <p role="status" className="px-4 pt-2 text-sm text-muted-foreground">
          Couldn’t refresh the run list. Showing the last copy.
        </p>
      )}

      <div
        className={cn(
          'flex-1 overflow-hidden p-4',
          scoring.mode === 'sequential' && 'overflow-y-auto'
        )}
      >
        {entries.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No dogs are on this class’s run list.
          </p>
        ) : scoring.mode === 'split' ? (
          <SplitPanelView
            entries={entries}
            settings={scoring.sessionSettings}
            selectedEntryId={onScreenEntryId}
            onSelectEntry={scoring.selectEntry}
            onSave={handleSave}
            onSaveAndNext={handleSaveAndNext}
            onClearResult={handleClearResult}
            isSaving={scoring.isSaving}
            maxTimeSeconds={maxTimeSeconds}
            sportType={sportKey}
          />
        ) : (
          <SequentialView
            entries={entries}
            currentIndex={sequentialIndex}
            settings={scoring.sessionSettings}
            onNavigate={index => {
              if (sortedEntries[index]) scoring.selectEntry(sortedEntries[index].entryId);
            }}
            onSave={handleSave}
            onSaveAndNext={handleSaveAndNext}
            onClearResult={handleClearResult}
            isSaving={scoring.isSaving}
            maxTimeSeconds={maxTimeSeconds}
            sportType={sportKey}
          />
        )}
      </div>
    </div>
  );
}

export default PaperScoresheetPage;
