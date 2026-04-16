/**
 * PipelineTab — Class pipeline Kanban for the Day-of Operations page.
 *
 * Scoped to the show already selected by the parent page. Provides
 * trial selection and the same drag-and-drop columns as PipelineDashboard,
 * without the standalone show-selector or dashboard header.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent } from '@dnd-kit/core';
import { useTrialStore } from '@/store/trialStore';
import { useUpdateClassMutation } from '@/hooks/queries/useClassesDatabase';
import { notifications } from '@/lib/notifications';
import { ClassPipelineColumn } from '@/features/pipeline/components/ClassPipelineColumn';
import { TrialContextRow } from '@/features/pipeline/components/TrialContextRow';
import { CLASS_PIPELINE_STAGES } from '@/features/pipeline/mission-control-types';
import type {
  ClassPipelineItem,
  ClassPipelineStage,
  ContextStats,
} from '@/features/pipeline/mission-control-types';
import { mapClassToStage, groupClassesByStage } from '@/features/pipeline/utils/classStageMapping';
import { stageToDefaultStatus } from '@/features/pipeline/utils/classStageMapping';
import type { DbClassUpdate } from '@/types/database-mappings';

interface PipelineTabProps {
  showId: string;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({ showId }) => {
  const allTrials = useTrialStore(s => s.trials);
  const allTrialClasses = useTrialStore(s => s.trialClasses);

  const trials = useMemo(() => allTrials.filter(t => t.showId === showId), [allTrials, showId]);

  const [selectedTrialId, setSelectedTrialId] = useState<string | null>(null);

  const selectedTrial = useMemo(
    () => trials.find(t => t.id === selectedTrialId) ?? trials[0] ?? null,
    [trials, selectedTrialId]
  );

  const pipelineClasses = useMemo<ClassPipelineItem[]>(() => {
    const trialId = selectedTrial?.id ?? '';
    const localClasses = trialId ? (allTrialClasses[trialId] ?? []) : [];
    if (!localClasses.length) return [];

    return localClasses.map(cls => {
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
        planned_start_time: null,
      };
    });
  }, [selectedTrial, allTrialClasses]);

  const classesByStage = useMemo(() => groupClassesByStage(pipelineClasses), [pipelineClasses]);
  const hasLiveClasses = pipelineClasses.some(c => c.stage === 'in-progress');

  const trialStats = useMemo<ContextStats>(() => {
    const scoredCount = pipelineClasses.reduce((s, c) => s + c.scored_count, 0);
    const totalEntries = pipelineClasses.reduce((s, c) => s + c.total_entries, 0);
    const percentComplete = totalEntries > 0 ? Math.round((scoredCount / totalEntries) * 100) : 0;
    return {
      trialCount: 1,
      classCount: pipelineClasses.length,
      scoredCount,
      totalEntries,
      percentComplete,
      percentQualified: null,
    };
  }, [pipelineClasses]);

  const updateClass = useUpdateClassMutation();

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const overData = over.data.current as { stage?: ClassPipelineStage } | undefined;
      const targetStage = overData?.stage;
      if (!targetStage) return;

      const activeData = active.data.current as
        | { type?: string; item?: { id: string; stage: ClassPipelineStage; name: string } }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem || draggedItem.stage === targetStage) return;

      const { status, is_scoring_finalized } = stageToDefaultStatus(targetStage);
      const updates: DbClassUpdate = { status };
      if (is_scoring_finalized !== undefined) {
        updates.is_scoring_finalized = is_scoring_finalized;
        if (!is_scoring_finalized) {
          updates.is_results_reviewed = false;
        }
      }

      updateClass.mutate(
        { id: draggedItem.id, updates },
        {
          onSuccess: () =>
            notifications.success(`${draggedItem.name} moved to ${targetStage.replace(/-/g, ' ')}`),
          onError: () => notifications.error(`Failed to move ${draggedItem.name}`),
        }
      );
    },
    [updateClass]
  );

  const trialId = selectedTrial?.id ?? '';

  if (trials.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium mb-1">No trials for this show</p>
        <p className="text-sm">Add a trial to see the class pipeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TrialContextRow
        trials={trials}
        selectedTrial={selectedTrial}
        onTrialChange={setSelectedTrialId}
        stats={trialStats}
      />

      {selectedTrial ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Class Pipeline
          </h2>
          <DndContext collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-4">
                {CLASS_PIPELINE_STAGES.map(stage => (
                  <ClassPipelineColumn
                    key={stage}
                    stage={stage}
                    classes={classesByStage.get(stage) ?? []}
                    showId={showId}
                    trialId={trialId}
                    isLive={stage === 'in-progress' && hasLiveClasses}
                  />
                ))}
              </div>
            </div>
            <DragOverlay dropAnimation={null} />
          </DndContext>
        </div>
      ) : null}
    </div>
  );
};

export default PipelineTab;
