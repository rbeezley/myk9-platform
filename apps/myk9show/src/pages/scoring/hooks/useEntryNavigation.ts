/**
 * useEntryNavigation Hook
 *
 * Handles entry loading and navigation for AKC scoresheets.
 * Extracts shared entry management logic from scoresheet components.
 *
 * Features:
 * - Load entries from replication cache
 * - Sync from server if cache is empty
 * - Transform entries to store format
 * - Navigate between entries
 * - Mark entries as "in ring"
 * - Initialize areas based on element/level
 *
 * @see docs/SCORESHEET_REFACTORING_PLAN.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useScoringStore, useEntryStore } from '../../../stores';
import { useAuth } from '../../../contexts/AuthContext';
import { markInRing } from '../../../services/entryService';
import type { AreaScore } from '../../../services/scoresheets/areaInitialization';
import type { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';
import {
  type RouteState,
  loadFromRouteState,
  loadFromIndexedDB,
  getMaxTimeForAreaHelper
} from './useEntryNavigationHelpers';

/**
 * Configuration options for entry navigation
 */
export interface EntryNavigationConfig {
  /** Class ID from route params */
  classId: string | undefined;
  /** Entry ID from route params (optional, defaults to first entry) */
  entryId: string | undefined;
  /** Whether this is a Nationals scoresheet (affects area initialization) */
  isNationals?: boolean;
  /** Sport type for scoring session */
  sportType?: 'AKC_SCENT_WORK' | 'AKC_SCENT_WORK_NATIONAL' | 'AKC_FASTCAT' | 'UKC_NOSEWORK' | 'ASCA_SCENT_DETECTION';
  /** Callback when entry is loaded and areas should be initialized */
  onEntryLoaded?: (entry: Entry, areas: AreaScore[]) => void;
  /** Callback to set trial date */
  onTrialDateLoaded?: (date: string) => void;
  /** Callback to set trial number */
  onTrialNumberLoaded?: (number: string) => void;
  /** Callback to set loading state */
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Return type for useEntryNavigation hook
 */
export interface EntryNavigationReturn {
  /** Currently selected entry */
  currentEntry: Entry | null;
  /** All entries for the class */
  entries: Entry[];
  /** Class information */
  classInfo: {
    element: string;
    level: string;
    section?: string;
  } | null;
  /** Whether entries are being loaded */
  isLoading: boolean;
  /** Navigate to a specific entry */
  navigateToEntry: (entryId: number) => void;
  /** Navigate to next entry in list */
  navigateToNextEntry: () => void;
  /** Navigate to previous entry in list */
  navigateToPreviousEntry: () => void;
  /** Get max time for a specific area index */
  getMaxTimeForArea: (areaIndex: number) => string;
  /** Reload entries from cache/server */
  reloadEntries: () => Promise<void>;
}

// Note: getDefaultMaxTime moved to useEntryNavigationHelpers.ts

/**
 * Hook for managing entry loading and navigation in scoresheets
 *
 * @example
 * ```tsx
 * const navigation = useEntryNavigation({
 *   classId,
 *   entryId,
 *   onEntryLoaded: (entry, areas) => {
 *     core.setAreas(areas);
 *   }
 * });
 *
 * // Use entry data
 * const { currentEntry, getMaxTimeForArea } = navigation;
 * ```
 */
export function useEntryNavigation(config: EntryNavigationConfig): EntryNavigationReturn {
  const {
    classId,
    entryId,
    isNationals = false,
    sportType = 'AKC_SCENT_WORK',
    onEntryLoaded,
    onTrialDateLoaded,
    onTrialNumberLoaded,
    onLoadingChange
  } = config;

  const navigate = useNavigate();
  const location = useLocation();
  const { showContext } = useAuth();

  // Check for entry data passed via route state (instant load optimization)
  const routeState = location.state as RouteState | null;

  // Store hooks
  const {
    isScoring,
    startScoringSession
  } = useScoringStore();

  const {
    currentEntry,
    setEntries,
    setCurrentClassEntries,
    setCurrentEntry
  } = useEntryStore();

  // Local state
  const [entries, setLocalEntries] = useState<Entry[]>([]);
  const [classInfo, setClassInfo] = useState<{
    element: string;
    level: string;
    section?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref for cleanup
  const currentEntryRef = useRef(currentEntry);

  // Refs for callbacks to prevent infinite re-render loops
  // These callbacks change on every parent render, so we store them in refs
  // to avoid triggering loadEntries recreations
  const onEntryLoadedRef = useRef(onEntryLoaded);
  const onTrialDateLoadedRef = useRef(onTrialDateLoaded);
  const onTrialNumberLoadedRef = useRef(onTrialNumberLoaded);
  const onLoadingChangeRef = useRef(onLoadingChange);

  // Keep refs updated
  useEffect(() => {
    onEntryLoadedRef.current = onEntryLoaded;
    onTrialDateLoadedRef.current = onTrialDateLoaded;
    onTrialNumberLoadedRef.current = onTrialNumberLoaded;
    onLoadingChangeRef.current = onLoadingChange;
  });

  // Update ref when entry changes
  useEffect(() => {
    currentEntryRef.current = currentEntry;
  }, [currentEntry]);

  // Cleanup: remove dog from ring on unmount
  useEffect(() => {
    return () => {
      const entry = currentEntryRef.current;
      if (entry?.id) {
        markInRing(entry.id, false).then(() => {}).catch((error) => {
          logger.error('❌ Cleanup: Failed to remove dog from ring:', error);
        });
      }
    };
  }, []);

  // ==========================================================================
  // ENTRY LOADING (refactored to use helper functions)
  // ==========================================================================

  const loadEntries = useCallback(async () => {
    if (!classId || !showContext?.licenseKey) {
      return;
    }

    // FAST PATH: Use entry data from route state if available (instant load)
    // Note: Still fetches current area_count from class to handle ASCA settings changes
    if (routeState?.entry && routeState?.classInfo) {
      const result = await loadFromRouteState(routeState, isNationals);

      setClassInfo(result.classInfo);
      setLocalEntries([result.entry]);
      setEntries([result.entry]);
      setCurrentClassEntries(parseInt(classId));
      setCurrentEntry(result.entry);

      onEntryLoadedRef.current?.(result.entry, result.areas);

      // Start scoring session if not already started
      if (!isScoring) {
        startScoringSession(
          parseInt(classId),
          result.entry.className || 'AKC Scent Work',
          sportType,
          'judge-1',
          1
        );
      }

      setIsLoading(false);
      onLoadingChangeRef.current?.(false);
      return;
    }

    // SLOW PATH: Load from IndexedDB (fallback for direct URL access)
    setIsLoading(true);
    onLoadingChangeRef.current?.(true);

    try {
      const result = await loadFromIndexedDB(classId, entryId, isNationals, {
        onTrialDateLoaded: onTrialDateLoadedRef.current,
        onTrialNumberLoaded: onTrialNumberLoadedRef.current
      });

      setClassInfo(result.classInfo);
      setLocalEntries(result.entries);
      setEntries(result.entries);
      setCurrentClassEntries(parseInt(classId));

      if (result.targetEntry) {
        setCurrentEntry(result.targetEntry);
        onEntryLoadedRef.current?.(result.targetEntry, result.areas);
      }

      // Start scoring session if not already started
      if (!isScoring && result.entries.length > 0) {
        startScoringSession(
          parseInt(classId),
          result.entries[0].className || 'AKC Scent Work',
          sportType,
          'judge-1',
          result.entries.length
        );
      }

    } catch (error) {
      logger.error('[EntryNavigation] Error loading entries:', error);
    } finally {
      setIsLoading(false);
      onLoadingChangeRef.current?.(false);
    }
  }, [
    classId,
    entryId,
    showContext?.licenseKey,
    isNationals,
    sportType,
    isScoring,
    routeState,
    setEntries,
    setCurrentClassEntries,
    setCurrentEntry,
    startScoringSession
  ]);

  // Load entries on mount
  useEffect(() => {
    if (classId && showContext?.licenseKey) {
      loadEntries();
    }
  }, [classId, entryId, showContext?.licenseKey, loadEntries]);

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  const navigateToEntry = useCallback((targetEntryId: number) => {
    navigate(`/class/${classId}/score/${targetEntryId}`);
  }, [classId, navigate]);

  const navigateToNextEntry = useCallback(() => {
    if (!currentEntry || entries.length === 0) return;

    const currentIndex = entries.findIndex(e => e.id === currentEntry.id);
    const nextIndex = (currentIndex + 1) % entries.length;
    navigateToEntry(entries[nextIndex].id);
  }, [currentEntry, entries, navigateToEntry]);

  const navigateToPreviousEntry = useCallback(() => {
    if (!currentEntry || entries.length === 0) return;

    const currentIndex = entries.findIndex(e => e.id === currentEntry.id);
    const prevIndex = (currentIndex - 1 + entries.length) % entries.length;
    navigateToEntry(entries[prevIndex].id);
  }, [currentEntry, entries, navigateToEntry]);

  // ==========================================================================
  // MAX TIME HELPER (refactored to use helper function)
  // ==========================================================================

  const getMaxTimeForArea = useCallback((areaIndex: number): string => {
    return getMaxTimeForAreaHelper(currentEntry, areaIndex, sportType);
  }, [currentEntry, sportType]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    currentEntry,
    entries,
    classInfo,
    isLoading,
    navigateToEntry,
    navigateToNextEntry,
    navigateToPreviousEntry,
    getMaxTimeForArea,
    reloadEntries: loadEntries
  };
}
