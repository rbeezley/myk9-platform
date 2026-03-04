/**
 * PipelineDashboard — Mission Control for trial secretaries.
 *
 * Show-focused workstation: select a show and trial, see class-level
 * pipeline progress across 5 columns.
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { Button } from '@/components/ui/button';
import { useMissionControlData } from '../hooks/useMissionControlData';
import { ClassPipelineColumn } from './ClassPipelineColumn';
import { ShowContextRow } from './ShowContextRow';
import { TrialContextRow } from './TrialContextRow';
import { CLASS_PIPELINE_STAGES } from '../mission-control-types';

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
    hasLiveClasses,
    showStats,
    trialStats,
  } = useMissionControlData();

  /** Contextual show timing label — replaces a static date display. */
  const timing = useMemo((): { text: string; isShowDay: boolean } => {
    if (!selectedShow?.startDate) return { text: '', isShowDay: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse date-only ("2026-03-14") or full ISO ("2026-03-14T00:00:00.000Z")
    // into a local-midnight Date to avoid timezone-related off-by-one errors.
    const toLocalDate = (raw: string): Date => {
      const dateOnly = raw.slice(0, 10); // "YYYY-MM-DD"
      return new Date(dateOnly + 'T00:00:00');
    };

    const start = toLocalDate(selectedShow.startDate);
    const end = selectedShow.endDate ? toLocalDate(selectedShow.endDate) : start;

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

  if (isLoading) {
    return <DelightfulLoading message="Loading mission control..." />;
  }

  const showId = selectedShow?.id ?? '';
  const trialId = selectedTrial?.id ?? '';

  return (
    <div className="space-y-4 px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
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

      {/* Show context row */}
      <ShowContextRow
        shows={shows}
        selectedShow={selectedShow}
        onShowChange={handleShowChange}
        stats={showStats}
      />

      {/* Trial context row */}
      {trials.length > 0 && (
        <TrialContextRow
          trials={trials}
          selectedTrial={selectedTrial}
          onTrialChange={handleTrialChange}
          stats={trialStats}
        />
      )}

      {/* Empty state: no shows */}
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

      {/* Empty state: show selected but no trials */}
      {selectedShow && trials.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium mb-1">No trials for this show</p>
          <p className="text-sm mb-4">Add a trial to see the class pipeline.</p>
          <Button asChild variant="outline">
            <Link to={`/secretary/shows`}>Manage Show</Link>
          </Button>
        </div>
      )}

      {/* Class pipeline */}
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
        </div>
      )}
    </div>
  );
};

export default PipelineDashboard;
