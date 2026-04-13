import { useState, useCallback } from 'react';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ScoringEntry } from '../types';
import {
  digitsToSeconds,
  modeStorageKey,
  RESULT_STATUS_MAP,
  DEFAULT_SESSION_SETTINGS,
  sortByExhibitorOrder,
} from '../paper-scoring-types';
import type { PaperResult, PaperScoringMode, SessionSettings } from '../paper-scoring-types';

function readModeFromStorage(userId: string): PaperScoringMode {
  try {
    const stored = localStorage.getItem(modeStorageKey(userId));
    if (stored === 'split' || stored === 'sequential') return stored;
  } catch {
    // localStorage unavailable (SSR, private mode)
  }
  return 'split';
}

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
  const [mode, setModeState] = useState<PaperScoringMode>(() => readModeFromStorage(userId));
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
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      const seconds = digitsToSeconds(timeDigits);
      const statusValue = RESULT_STATUS_MAP[result];
      setIsSaving(true);
      try {
        await replicatedEntriesTable.updateEntry(entryId, {
          result_status: statusValue,
          resultStatus: statusValue,
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
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      await performSave(entryId, result, timeDigits, faults);
      setSelectedEntryId(null);
    },
    [performSave]
  );

  const saveAndNext = useCallback(
    async (entryId: string, result: PaperResult, timeDigits: string, faults: number) => {
      await performSave(entryId, result, timeDigits, faults);
      const next = sortByExhibitorOrder(entries).find(e => !e.isScored && e.entryId !== entryId);
      setSelectedEntryId(next?.entryId ?? null);
    },
    [performSave, entries]
  );

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
    saveAndNext,
    setSessionSettings,
    setMode,
  };
}
