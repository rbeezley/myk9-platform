/**
 * PipelineDashboard — Mission Control for trial secretaries.
 *
 * Show-focused workstation: select a show and trial, see class-level
 * pipeline progress across 5 columns.
 */

import React from 'react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
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

  if (isLoading) {
    return (
      <SecretaryLayout fullWidth>
        <DelightfulLoading message="Loading mission control..." />
      </SecretaryLayout>
    );
  }

  const showId = selectedShow?.id ?? '';
  const trialId = selectedTrial?.id ?? '';

  return (
    <SecretaryLayout fullWidth>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            {hasLiveClasses && (
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-green-400 font-medium">Show Day</span>
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
            <p className="text-sm">Create a show to get started with Mission Control.</p>
          </div>
        )}

        {/* Empty state: show selected but no trials */}
        {selectedShow && trials.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium mb-1">No trials for this show</p>
            <p className="text-sm">Add a trial to see the class pipeline.</p>
          </div>
        )}

        {/* Class pipeline */}
        {selectedTrial && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Class Pipeline
              {classesLoading && (
                <span className="ml-2 text-muted-foreground/50 normal-case font-normal">
                  Loading classes...
                </span>
              )}
            </h2>
            <div className="overflow-x-auto">
              <div className="flex gap-3 pb-4">
                {CLASS_PIPELINE_STAGES.map((stage) => (
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
    </SecretaryLayout>
  );
};

export default PipelineDashboard;
