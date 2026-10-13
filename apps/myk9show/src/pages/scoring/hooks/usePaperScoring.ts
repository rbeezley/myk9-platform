import { useState, useCallback, useMemo } from 'react';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { SCORE_DETAIL_CLEAR_FIELDS } from '@/services/replication/scoreResetFields';
import type { ScoringEntry } from '../types';
import {
  digitsToSeconds,
  modeStorageKey,
  DEFAULT_SESSION_SETTINGS,
  sortByExhibitorOrder,
} from '../paper-scoring-types';
import { mapQualificationToResultStatus } from '@/utils/scoringMappings';
import type { PaperResult, PaperScoringMode, SessionSettings } from '../paper-scoring-types';

function writeModeToStorage(userId: string, mode: PaperScoringMode) {
  try {
    localStorage.setItem(modeStorageKey(userId), mode);
  } catch {
    // ignore
  }
}

/**
 * The dog the person asked for: an entry id; `null` for nothing (the split
 * panel closed); `undefined` for the class's first scorable dog.
 */
type RequestedEntry = string | null | undefined;

/** The dog a class opens on: the first unscored, else the first, in exhibitor order. */
export function firstScorableEntryId(sorted: readonly ScoringEntry[]): string | null {
  return (sorted.find(entry => !entry.isScored) ?? sorted[0])?.entryId ?? null;
}

/**
 * The one dog on screen (MYK9-1130), which every save and clear writes to.
 * The requested dog while it is listed; when it leaves the class, the first
 * scorable dog. Nothing only when the class is empty, or when the split
 * panel was closed; card mode always shows a dog when there is one.
 */
export function resolveOnScreenEntryId(
  sorted: readonly ScoringEntry[],
  requested: RequestedEntry,
  mode: PaperScoringMode
): string | null {
  if (typeof requested === 'string' && sorted.some(entry => entry.entryId === requested)) {
    return requested;
  }
  if (requested === null && mode === 'split') return null;
  return firstScorableEntryId(sorted);
}

export function usePaperScoring(entries: ScoringEntry[], userId: string) {
  const [requestedEntryId, setRequestedEntryId] = useState<RequestedEntry>(undefined);
  const [sessionSettings, setSessionSettingsState] =
    useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [mode, setModeState] = useState<PaperScoringMode>('split');
  const [isSaving, setIsSaving] = useState(false);

  const sortedEntries = useMemo(() => sortByExhibitorOrder(entries), [entries]);
  const onScreenEntryId = resolveOnScreenEntryId(sortedEntries, requestedEntryId, mode);

  const selectEntry = useCallback((entryId: string | null) => {
    setRequestedEntryId(entryId);
  }, []);

  /** Returns entryId of the next unscored entry in run order, or null if all scored. */
  const nextUnscored = useCallback((): string | null => {
    const next = sortByExhibitorOrder(entries).find(e => !e.isScored);
    return next?.entryId ?? null;
  }, [entries]);

  const performSave = useCallback(
    async (
      entryId: string,
      result: PaperResult,
      timeDigits: string,
      faults: number,
      reason?: string
    ) => {
      const seconds = digitsToSeconds(timeDigits);
      const statusValue = mapQualificationToResultStatus(result);
      const resultReason =
        result === 'NQ' || result === 'EX' || result === 'DQ' ? reason?.trim() || null : null;
      const completedAt = new Date().toISOString();
      setIsSaving(true);
      try {
        await replicatedEntriesTable.updateEntry(entryId, {
          result_status: statusValue,
          resultStatus: statusValue,
          disqualification_reason: resultReason,
          search_time_seconds: seconds,
          searchTimeSeconds: seconds,
          total_faults: faults,
          totalFaults: faults,
          is_scored: true,
          isScored: true,
          scoring_completed_at: completedAt,
          scoringCompletedAt: completedAt,
          checkInStatus: 'completed',
          check_in_status: 'completed',
        });
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  const saveEntry = useCallback(
    async (
      entryId: string,
      result: PaperResult,
      timeDigits: string,
      faults: number,
      reason?: string
    ) => {
      await performSave(entryId, result, timeDigits, faults, reason);
      // The saved dog stays on screen, showing its result.
      setRequestedEntryId(entryId);
    },
    [performSave]
  );

  const clearEntry = useCallback(async (entryId: string) => {
    setIsSaving(true);
    try {
      await replicatedEntriesTable.updateEntry(entryId, {
        result_status: 'pending',
        resultStatus: 'pending',
        is_scored: false,
        isScored: false,
        search_time_seconds: 0,
        searchTimeSeconds: 0,
        total_faults: 0,
        totalFaults: 0,
        finalPlacement: null,
        scoringCompletedAt: null,
        scoring_completed_at: null,
        disqualification_reason: null,
        ...SCORE_DETAIL_CLEAR_FIELDS,
      });
      // The cleared dog stays on screen.
      setRequestedEntryId(entryId);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const setSessionSettings = useCallback((patch: Partial<SessionSettings>) => {
    setSessionSettingsState(prev => ({ ...prev, ...patch }));
  }, []);

  const setMode = useCallback(
    (newMode: PaperScoringMode) => {
      setModeState(newMode);
      writeModeToStorage(userId, newMode);
    },
    [userId]
  );

  return {
    onScreenEntryId,
    sessionSettings,
    mode,
    isSaving,
    selectEntry,
    nextUnscored,
    saveEntry,
    clearEntry,
    setSessionSettings,
    setMode,
  };
}
