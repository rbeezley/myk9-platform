/**
 * PipelineDashboard — Mission Control for trial secretaries.
 *
 * Show-focused workstation: select a show and trial, see class-level
 * pipeline progress across 5 columns.
 */

import React, { useMemo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, pointerWithin, type DragEndEvent } from '@dnd-kit/core';
import { Plus, Settings, Copy } from 'lucide-react';
import { ShowCloneDialog } from '@/components/shows/cloning';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { useUpdateClassMutation } from '@/hooks/queries/useClassesDatabase';
import { useMissionControlData } from '../hooks/useMissionControlData';
import { ClassPipelineColumn } from './ClassPipelineColumn';
import { ShowContextRow } from './ShowContextRow';
import { TrialContextRow } from './TrialContextRow';
import { CLASS_PIPELINE_STAGES } from '../mission-control-types';
import type { ClassPipelineStage } from '../mission-control-types';
import { stageToDefaultStatus } from '../utils/classStageMapping';
import { AnnouncementsCard } from './AnnouncementsCard';
import { useQuickActionStats } from '../hooks/useQuickActionStats';
import { QuickActionsSection } from './QuickActionsSection';
import { ShowSettingsPanel } from './ShowSettingsPanel';
import type { DbClassUpdate } from '@/types/database-mappings';
import { parseLocalDateString } from '@myk9/core';

export const PipelineDashboard: React.FC = () => {
  const {
    isLoading,
    classesLoading,
    shows,
    selectedShow,
    selectedTrial,
    trials,
    handleShowChange,
    handleTrialChange,
    classesByStage,
    pipelineClasses,
    hasLiveClasses,
    showStats,
    trialStats,
  } = useMissionControlData();

  const { pendingEntriesCount, reportsReadyCount, activeTrialsCount } = useQuickActionStats(
    selectedShow?.id ?? ''
  );

  /** Contextual show timing label — replaces a static date display. */
  const timing = useMemo((): { text: string; isShowDay: boolean } => {
    if (!selectedShow?.startDate) return { text: '', isShowDay: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = parseLocalDateString(selectedShow.startDate.slice(0, 10));
    const end = selectedShow.endDate
      ? parseLocalDateString(selectedShow.endDate.slice(0, 10))
      : start;

    if (!start || !end) return { text: '', isShowDay: false };

    if (today >= start && today <= end) {
      return { text: 'Show Day!', isShowDay: true };
    }

    const diffMs = start.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return { text: 'Show starts tomorrow', isShowDay: false };
    if (diffDays > 1 && diffDays <= 14) {
      return { text: `${diffDays} days until show`, isShowDay: false };
    }
    if (diffDays > 14) {
      return {
        text: `Starts ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        isShowDay: false,
      };
    }

    // Past show
    return { text: 'Show complete', isShowDay: false };
  }, [selectedShow]);

  const updateClass = useUpdateClassMutation();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      // Get the target column stage from the droppable
      const overData = over.data.current as { stage?: ClassPipelineStage } | undefined;
      const targetStage = overData?.stage;
      if (!targetStage) return;

      // Get the dragged item
      const activeData = active.data.current as
        | {
            type?: string;
            item?: { id: string; stage: ClassPipelineStage; name: string };
          }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem || draggedItem.stage === targetStage) return;

      // Map target stage to DB status
      const { status, is_scoring_finalized } = stageToDefaultStatus(targetStage);
      const updates: DbClassUpdate = { status };
      if (is_scoring_finalized !== undefined) {
        updates.is_scoring_finalized = is_scoring_finalized;
        // Reset review flag when moving to results
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

  if (isLoading) {
    return <DelightfulLoading message="Loading mission control..." />;
  }

  const showId = selectedShow?.id ?? '';
  const trialId = selectedTrial?.id ?? '';

  return (
    <div className="space-y-4 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Secretary Dashboard</h1>
          {selectedShow && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSettingsOpen(true)}
              title="Show Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link to="/secretary/create-show/wizard">
              <Plus className="h-4 w-4 mr-2" />
              New Show
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCloneDialogOpen(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Clone Show
          </Button>
          <div className="text-right">
            {timing.text && (
              <div className="flex items-center gap-1.5 justify-end">
                {timing.isShowDay && (
                  <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                )}
                <span
                  className={
                    timing.isShowDay
                      ? 'text-sm text-green-400 font-medium'
                      : 'text-sm text-muted-foreground'
                  }
                >
                  {timing.text}
                </span>
              </div>
            )}
            {!timing.isShowDay && hasLiveClasses && (
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-green-400 font-medium">Live</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ShowContextRow
        shows={shows}
        selectedShow={selectedShow}
        onShowChange={handleShowChange}
        stats={showStats}
      />

      {trials.length > 0 && (
        <TrialContextRow
          trials={trials}
          selectedTrial={selectedTrial}
          onTrialChange={handleTrialChange}
          stats={trialStats}
        />
      )}

      {selectedShow && (
        <AnnouncementsCard showId={selectedShow.id} showEndDate={selectedShow.endDate} />
      )}

      <QuickActionsSection
        showId={selectedShow?.id ?? ''}
        pendingEntriesCount={pendingEntriesCount}
        reportsReadyCount={reportsReadyCount}
        activeTrialsCount={activeTrialsCount}
      />

      {shows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium mb-1">No shows yet</p>
          <p className="text-sm mb-4">Create a show to get started with Mission Control.</p>
          <Button asChild>
            <Link to="/secretary/create-show">
              <Plus className="h-4 w-4 mr-2" />
              Create Show
            </Link>
          </Button>
        </div>
      )}

      {selectedShow && trials.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium mb-1">No trials for this show</p>
          <p className="text-sm mb-4">Add a trial to see the class pipeline.</p>
          <Button asChild variant="outline">
            <Link to={`/secretary/shows`}>Manage Show</Link>
          </Button>
        </div>
      )}

      {selectedTrial && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Class Pipeline
            {classesLoading && (
              <span className="ml-2 text-muted-foreground/50 normal-case font-normal">
                Loading classes...
              </span>
            )}
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
      )}

      {selectedShow && (
        <ShowSettingsPanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          showId={selectedShow.id}
          trials={trials.map(t => ({ id: t.id, name: t.name || `Trial ${t.trialNumber}` }))}
          classes={pipelineClasses.map(c => ({
            id: c.id,
            trialId: '', // trial ID not available on ClassPipelineItem — acceptable for now
            name: c.name,
          }))}
        />
      )}

      <ShowCloneDialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen} />
    </div>
  );
};

export default PipelineDashboard;
