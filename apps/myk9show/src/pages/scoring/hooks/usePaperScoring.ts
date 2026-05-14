import { useState, useCallback } from 'react';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
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

export function usePaperScoring(entries: ScoringEntry[], userId: string) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [sessionSettings, setSessionSettingsState] =
    useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [mode, setModeState] = useState<PaperScoringMode>('split');
  const [isSaving, setIsSaving] = useState(false);

  const currentIndex = entries.findIndex(e => e.entryId === selectedEntryId);

  const selectEntry = useCallback((entryId: string | null) => {
    setSelectedEntryId(entryId);
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
      const resultReason = result === 'NQ' || result === 'EX' ? reason?.trim() || null : null;
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
      setSelectedEntryId(null);
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
      });
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
    selectedEntryId,
    sessionSettings,
    mode,
    currentIndex,
    isSaving,
    selectEntry,
    nextUnscored,
    saveEntry,
    clearEntry,
    setSessionSettings,
    setMode,
  };
}
