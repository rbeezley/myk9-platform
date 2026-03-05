/**
 * Data hook for the Mission Control dashboard.
 *
 * Manages show/trial selection and computes class pipeline data.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useClassesByTrialQuery } from '@/hooks/queries/useClassesDatabase';
import { mapClassToStage, groupClassesByStage } from '../utils/classStageMapping';
import type { ClassPipelineItem, ContextStats } from '../mission-control-types';

export function useMissionControlData() {
  const { shows, isLoading: showsLoading } = useShowStore();
  const allTrials = useTrialStore(s => s.trials);

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

  // Fetch classes for the selected trial
  const effectiveTrialId = selectedTrial?.id ?? '';
  const { data: rawClasses, isLoading: classesLoading } = useClassesByTrialQuery(
    effectiveTrialId,
    !!effectiveTrialId
  );

  // Map raw DB classes → ClassPipelineItem[]
  const pipelineClasses = useMemo<ClassPipelineItem[]>(() => {
    if (!rawClasses) return [];
    // Robust entry count: prefer scored total_entries_count,
    // fall back to entries relation length from the Supabase join.
    return rawClasses.map((cls: Record<string, unknown>) => {
      const entries = (cls as { entries?: { id: string }[] }).entries;
      const totalEntries = Number(cls.total_entries_count) || entries?.length || 0;

      return {
        id: String(cls.id),
        name: String(cls.name ?? 'Unnamed Class'),
        judge_name: cls.judge_name ? String(cls.judge_name) : null,
        status: cls.status ? String(cls.status) : null,
        stage: mapClassToStage(
          cls.status as string | null,
          cls.is_scoring_finalized as boolean | null
        ),
        scored_count: Number(cls.scored_count ?? 0),
        total_entries: totalEntries,
        is_scoring_finalized: Boolean(cls.is_scoring_finalized),
        is_results_reviewed: Boolean((cls as Record<string, unknown>).is_results_reviewed),
        start_time: cls.start_time ? String(cls.start_time) : null,
        planned_start_time: cls.planned_start_time ? String(cls.planned_start_time) : null,
      };
    });
  }, [rawClasses]);

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
