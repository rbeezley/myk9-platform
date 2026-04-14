/**
 * Data hook for the Mission Control dashboard.
 *
 * Manages show/trial selection and computes class pipeline data.
 *
 * Uses the local-first trialStore for both trials AND classes so that
 * newly created data appears immediately (even before Supabase sync).
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { ScopeType } from '@/types/auth-types';
import { mapClassToStage, groupClassesByStage } from '../utils/classStageMapping';
import type { ClassPipelineItem, ContextStats } from '../mission-control-types';

export function useMissionControlData() {
  const { shows: rawShows, isLoading: showsLoading } = useShowStore();
  const { userWithRoles, isAdmin, loading: authLoading } = useAuthContext();
  const { status: syncStatus } = useReplicationSync();

  // Stable key for club scope IDs (avoids recomputation when AuthContext rebuilds the scopes array)
  const clubScopeKey = useMemo(
    () =>
      (userWithRoles?.scopes ?? [])
        .filter(s => s.scopeType === ScopeType.CLUB)
        .map(s => s.scopeId)
        .sort()
        .join(','),
    [userWithRoles?.scopes]
  );

  const shows = useMemo(() => {
    const clubIdSet = new Set(clubScopeKey ? clubScopeKey.split(',') : []);
    // INTENT: Only platform admins bypass the club filter. Non-admin users with no
    // club scopes assigned yet see zero shows — the empty state is handled in the UI.
    // Do NOT fall back to "show all" for unskoped users; that leaks cross-club data.
    const skipFilter = isAdmin;
    const seen = new Set<string>();

    const filtered = rawShows.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return skipFilter || clubIdSet.has(s.clubId);
    });

    return filtered;
  }, [rawShows, isAdmin, clubScopeKey]);
  const allTrials = useTrialStore(s => s.trials);
  const allTrialClasses = useTrialStore(s => s.trialClasses);

  // Selection state
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);

  // Derive selected show
  const selectedShow = useMemo(
    () => shows.find(s => s.id === selectedShowId) ?? shows[0] ?? null,
    [shows, selectedShowId]
  );

  // Derive trials for selected show from trialStore
  const trials = useMemo(
    () => (selectedShow ? allTrials.filter(t => t.showId === selectedShow.id) : []),
    [allTrials, selectedShow]
  );

  // Derive selected trial
  const selectedTrial = useMemo(
    () => trials.find(t => t.id === selectedTrialId) ?? trials[0] ?? null,
    [trials, selectedTrialId]
  );

  // Get classes for the selected trial from the local-first trialStore.
  // This ensures newly created classes appear immediately without waiting
  // for Supabase sync (which was the root cause of the missing-classes bug).
  const effectiveTrialId = selectedTrial?.id ?? '';
  const classesLoading = false; // Local data is always available synchronously

  // Map local TrialClass → ClassPipelineItem[]
  const pipelineClasses = useMemo<ClassPipelineItem[]>(() => {
    const localClasses = effectiveTrialId ? (allTrialClasses[effectiveTrialId] ?? []) : [];
    if (!localClasses.length) return [];

    return localClasses.map(cls => {
      // Build a display name from element + level (TrialClass doesn't have a "name" field)
      const name =
        [cls.element, cls.level, cls.section].filter(Boolean).join(' ') || 'Unnamed Class';

      const isScoringFinalized = cls.isScoringFinalized ?? false;
      const isResultsReviewed = cls.isResultsReviewed ?? false;

      return {
        id: cls.id,
        name,
        judge_name: cls.judgeName ?? null,
        status: cls.status ?? null,
        stage: mapClassToStage(cls.status, isScoringFinalized),
        scored_count: cls.completedEntries ?? 0,
        total_entries: cls.entries ?? 0,
        is_scoring_finalized: isScoringFinalized,
        is_results_reviewed: isResultsReviewed,
        start_time: cls.startTime || null,
        planned_start_time: null, // Not tracked on TrialClass
      };
    });
  }, [effectiveTrialId, allTrialClasses]);

  // Group by stage
  const classesByStage = useMemo(() => groupClassesByStage(pipelineClasses), [pipelineClasses]);

  // Show-level stats (across ALL trials for the selected show)
  const showStats = useMemo<ContextStats>(() => {
    const trialCount = trials.length;
    const classCount = pipelineClasses.length;
    const scoredCount = pipelineClasses.reduce((s, c) => s + c.scored_count, 0);
    const totalEntries = pipelineClasses.reduce((s, c) => s + c.total_entries, 0);
    const percentComplete = totalEntries > 0 ? Math.round((scoredCount / totalEntries) * 100) : 0;

    return {
      trialCount,
      classCount,
      scoredCount,
      totalEntries,
      percentComplete,
      percentQualified: null, // Needs entry-level scoring data — future enhancement
    };
  }, [trials, pipelineClasses]);

  // Trial-level stats
  const trialStats = useMemo<ContextStats>(() => {
    const classCount = pipelineClasses.length;
    const scoredCount = pipelineClasses.reduce((s, c) => s + c.scored_count, 0);
    const totalEntries = pipelineClasses.reduce((s, c) => s + c.total_entries, 0);
    const percentComplete = totalEntries > 0 ? Math.round((scoredCount / totalEntries) * 100) : 0;

    return {
      trialCount: 1,
      classCount,
      scoredCount,
      totalEntries,
      percentComplete,
      percentQualified: null,
    };
  }, [pipelineClasses]);

  // Handle show change — reset trial selection
  const handleShowChange = useCallback((showId: string) => {
    setSelectedShowId(showId);
    setSelectedTrialId(null);
  }, []);

  const handleTrialChange = useCallback((trialId: string) => {
    setSelectedTrialId(trialId);
  }, []);

  const selectShow = useShowStore(s => s.selectShow);

  // Persist selected show so other secretary pages (Entry Management) can pick it up
  // Also sync to showStore so announcement subscriptions know which show is active
  useEffect(() => {
    if (selectedShow) {
      try {
        localStorage.setItem('myk9show:entryMgmt:lastShowId', selectedShow.id);
      } catch {
        // Private browsing or storage quota exceeded — non-fatal
      }
      selectShow(selectedShow.id);
    }
  }, [selectedShow, selectShow]);

  // Determine if any class is actively being scored
  const hasLiveClasses = pipelineClasses.some(c => c.stage === 'in-progress');

  // True while:
  // - showStore is reading from IndexedDB, OR
  // - auth RBAC hasn't loaded yet (isAdmin would be wrong), OR
  // - first-time sync is in progress and shows haven't arrived yet
  const showsSyncing = syncStatus.tablesStatus['shows'] === 'syncing';
  const isLoading = showsLoading || authLoading || (showsSyncing && rawShows.length === 0);

  return {
    // Loading
    isLoading,
    classesLoading,

    // Selection
    shows,
    selectedShow,
    selectedTrial,
    trials,
    handleShowChange,
    handleTrialChange,

    // Pipeline data
    pipelineClasses,
    classesByStage,
    hasLiveClasses,

    // Stats
    showStats,
    trialStats,
  };
}
