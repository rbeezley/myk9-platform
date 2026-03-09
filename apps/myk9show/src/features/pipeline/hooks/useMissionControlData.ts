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
import { ScopeType } from '@/types/auth-types';
import { mapClassToStage, groupClassesByStage } from '../utils/classStageMapping';
import type { ClassPipelineItem, ContextStats } from '../mission-control-types';

export function useMissionControlData() {
  const { shows: rawShows, isLoading: showsLoading } = useShowStore();
  const { userWithRoles, isAdmin } = useAuthContext();

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
    const skipFilter = isAdmin || clubIdSet.size === 0;
    const seen = new Set<string>();

    return rawShows.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      // Platform admins see all shows; users with no club scopes fall back to all shows
      return skipFilter || clubIdSet.has(s.clubId);
    });
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
  const localClasses = effectiveTrialId ? (allTrialClasses[effectiveTrialId] ?? []) : [];
  const classesLoading = false; // Local data is always available synchronously

  // Map local TrialClass → ClassPipelineItem[]
  const pipelineClasses = useMemo<ClassPipelineItem[]>(() => {
    if (!localClasses.length) return [];

    return localClasses.map(cls => {
      // Build a display name from element + level (TrialClass doesn't have a "name" field)
      const name = [cls.element, cls.level].filter(Boolean).join(' ') || 'Unnamed Class';

      return {
        id: cls.id,
        name,
        judge_name: cls.judgeName ?? null,
        status: cls.status ?? null,
        stage: mapClassToStage(cls.status, null),
        scored_count: cls.completedEntries ?? 0,
        total_entries: cls.entries ?? 0,
        is_scoring_finalized: false, // Not tracked on TrialClass; defaults to not-finalized
        is_results_reviewed: false, // Not tracked on TrialClass
        start_time: cls.startTime || null,
        planned_start_time: null, // Not tracked on TrialClass
      };
    });
  }, [localClasses]);

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

  // Persist selected show so other secretary pages (Entry Management) can pick it up
  useEffect(() => {
    if (selectedShow) {
      localStorage.setItem('myk9show:entryMgmt:lastShowId', selectedShow.id);
    }
  }, [selectedShow]);

  // Determine if any class is actively being scored
  const hasLiveClasses = pipelineClasses.some(c => c.stage === 'in-progress');

  return {
    // Loading
    isLoading: showsLoading,
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
