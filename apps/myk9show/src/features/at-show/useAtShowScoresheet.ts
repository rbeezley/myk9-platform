/**
 * useAtShowScoresheet — data-load + score-submit engine for the at-show live
 * scoresheet (Phase 1h).
 *
 * Mirrors `apps/myk9show/src/pages/scoring/ScoresheetPage.tsx`'s load + submit
 * logic, extracted into a hook so the at-show mobile scoresheet can reuse the
 * SAME engine (replication tables + `useOptimisticScoring` — offline-safe) and
 * the SAME `@myk9/scoring-ui` `LiveScoresheet` (the myK9Q-style stopwatch),
 * while supplying its own at-show navigation chrome.
 *
 * Additive on purpose: this does NOT refactor the secretary `ScoresheetPage`
 * (that page keeps its inline logic). A future cleanup can point both at this
 * hook (plan D1); kept separate here to avoid touching a live surface.
 */

import { useEffect, useState } from 'react';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { logger } from '@/services/LoggingService';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { transitionToInRing, transitionToCompleted } from '@/utils/checkInTransitions';
import { buildResolvedClassRules } from '@myk9/scoring-ui';
import type { ResolvedClassRules, ScoreData } from '@myk9/scoring-ui';
import type { ScoringEntry, ClassInfo } from '@/pages/scoring/types';
import {
  isCurrentFinalPendingEntry,
  recordCompletionIntentIfConfirmed,
} from './atShowClassCompletion';
import {
  toScoringEntry,
  toClassInfo,
  resolveSportTypeForClass,
  toOptimisticScorePayload,
} from '@/pages/scoring/types';

export interface UseAtShowScoresheetOptions {
  showId: string | undefined;
  classId: string | undefined;
  entryId: string | undefined;
  /** Called after a score is successfully submitted (at-show nav happens here). */
  onScored: () => void;
}

export interface UseAtShowScoresheetResult {
  entry: ScoringEntry | null;
  classInfo: ClassInfo | null;
  rules: ResolvedClassRules | null;
  /** Sport type string from the trial (preferred over class-name inference). */
  trialSportType: string | undefined;
  trialDate: string | undefined;
  trialNumber: string | undefined;
  isLoading: boolean;
  error: string | null;
  isInitialSyncPending: boolean;
  loadedClassId: string | null;
  loadedEntryId: string | null;
  submit: (scoreData: ScoreData) => Promise<void>;
  isSyncing: boolean;
  hasSyncError: boolean;
  /** Set when a submit failed to durably queue the score; the judge stays on the sheet. */
  submitError: string | null;
  /** Clear the submit error (e.g. when the judge edits and retries). */
  clearSubmitError: () => void;
}

export function useAtShowScoresheet({
  showId,
  classId,
  entryId,
  onScored,
}: UseAtShowScoresheetOptions): UseAtShowScoresheetResult {
  const { submitScoreOptimistically, isSyncing, hasError: hasSyncError } = useOptimisticScoring();
  const { status: syncStatus } = useReplicationSync();
  const isInitialSyncPending = areReplicationTablesPendingFirstSync(syncStatus, [
    'classes',
    'entries',
    'dogs',
    'trials',
  ]);

  const [entry, setEntry] = useState<ScoringEntry | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [rules, setRules] = useState<ResolvedClassRules | null>(null);
  const [trialSportType, setTrialSportType] = useState<string | undefined>(undefined);
  const [trialDate, setTrialDate] = useState<string | undefined>(undefined);
  const [trialNumber, setTrialNumber] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const [loadedEntryId, setLoadedEntryId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setEntry(null);
      setClassInfo(null);
      setRules(null);
      setTrialSportType(undefined);
      setTrialDate(undefined);
      setTrialNumber(undefined);
      setLoadedClassId(null);
      setLoadedEntryId(null);

      if (!showId || !classId || !entryId) {
        setError('Missing class or entry ID');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        await replicatedTrialsTable.sync(showId);
        const showTrials = await replicatedTrialsTable.getTrialsByShow(showId);
        await Promise.all([
          // Classes are scoped by trial_id, so hydrate each trial belonging to
          // the route's show instead of confusing a show id for a trial id.
          ...showTrials.map(trial => replicatedClassesTable.sync(trial.id)),
          replicatedEntriesTable.sync(showId),
        ]);
        if (cancelled) return;

        const [cls, allEntries] = await Promise.all([
          replicatedClassesTable.getClassById(classId),
          replicatedEntriesTable.getEntriesByClass(classId),
        ]);
        if (cancelled) return;
        if (!cls) {
          if (isInitialSyncPending) {
            setError(null);
            setIsLoading(false);
            return;
          }
          setError('Class not found');
          setIsLoading(false);
          return;
        }

        const [derived, trial] = await Promise.all([
          resolveSportTypeForClass(cls.trialId),
          cls.trialId ? replicatedTrialsTable.getTrialById(cls.trialId) : null,
        ]);
        if (cancelled) return;
        if (derived) setTrialSportType(derived);
        if (trial) {
          setTrialDate(trial.date || trial.trial_date);
          setTrialNumber(trial.trialNumber);
        }

        const rawEntry = allEntries.find(e => e.id === entryId);
        if (!rawEntry) {
          if (isInitialSyncPending) {
            setError(null);
            setIsLoading(false);
            return;
          }
          setError('Entry not found');
          setIsLoading(false);
          return;
        }

        // Auto-set check-in status to in-ring when the scoresheet opens.
        transitionToInRing(rawEntry.id, rawEntry.checkInStatus);

        const dog = rawEntry.dogId ? await replicatedDogsTable.get(rawEntry.dogId) : null;
        if (cancelled) return;

        setEntry(toScoringEntry(rawEntry, dog, 0));
        setClassInfo(toClassInfo(cls, allEntries.length));
        setRules(buildResolvedClassRules(cls));
        setLoadedClassId(classId);
        setLoadedEntryId(entryId);
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load at-show scoresheet data:', 'at-show', {}, err as Error);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [showId, classId, entryId, isInitialSyncPending]);

  const submit = async (scoreData: ScoreData) => {
    if (!entry || !classInfo) return;
    // Clear any prior failure before this attempt.
    setSubmitError(null);
    const completionClassId = classInfo.id;
    let wasFinalPendingEntry = false;
    try {
      wasFinalPendingEntry = await isCurrentFinalPendingEntry(completionClassId, entry.entryId);
    } catch (err) {
      logger.warn('Could not verify class completion before scoring', 'at-show', {}, err as Error);
    }

    let scoreSaved = false;
    await submitScoreOptimistically({
      entryId: entry.entryId,
      classId: classInfo.id,
      armband: entry.armband,
      className: classInfo.name,
      scoreData: toOptimisticScorePayload(scoreData),
      onSuccess: () => {
        scoreSaved = true;
      },
      onError: err => {
        // Durable-queue failure: the score is NOT saved. Keep the judge on the
        // sheet with a visible error rather than navigating away.
        logger.error('At-show score submission failed:', 'at-show', {}, err as Error);
        setSubmitError(
          err instanceof Error
            ? `Score not saved: ${err.message}`
            : 'Score not saved — please retry.'
        );
      },
    });

    if (!scoreSaved) return;

    try {
      await recordCompletionIntentIfConfirmed(completionClassId, wasFinalPendingEntry);
    } catch (err) {
      logger.warn('Could not verify class completion after scoring', 'at-show', {}, err as Error);
    }
    transitionToCompleted(entry.entryId);
    onScored();
  };

  return {
    entry,
    classInfo,
    rules,
    trialSportType,
    trialDate,
    trialNumber,
    isLoading,
    error,
    isInitialSyncPending,
    loadedClassId,
    loadedEntryId,
    submit,
    isSyncing,
    hasSyncError,
    submitError,
    clearSubmitError: () => setSubmitError(null),
  };
}
