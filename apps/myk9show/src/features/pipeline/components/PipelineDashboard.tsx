import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Copy } from 'lucide-react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { ShowCloneDialog } from '@/components/shows/cloning';
import { StatisticsCards } from '@/pages/SecretaryDashboard/StatisticsCards';
import { useSecretaryDashboardData } from '@/pages/SecretaryDashboard/useSecretaryDashboardData';
import { PipelineColumn } from './PipelineColumn';
import { MissionControlSidebar } from './MissionControlSidebar';
import { getCannedItemsForStage } from '../constants';
import type { PipelineStage, TrialPipelineData } from '../types';
import { PIPELINE_STAGES } from '../types';

export const PipelineDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  const { shows, allTrials, activeTrials, statistics } = useSecretaryDashboardData();

  const isLoading = allTrials.length === 0 && shows.length === 0;

  // Map trials into pipeline data format
  const pipelineTrials = useMemo<TrialPipelineData[]>(() => {
    return allTrials.map((t) => ({
      id: t.id,
      show_id: t.showId,
      name: t.name ?? 'Trial',
      date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
      // Cast needed: pipeline_stage not yet in SyncableTrial type
      pipeline_stage: (
        (t as unknown as { pipeline_stage?: number }).pipeline_stage ?? 1
      ) as PipelineStage,
      status: t.status,
      venue_name: null,
      planned_start_time: null,
      judge_count: 0,
      has_fee_schedule: false,
      entry_open_date: null,
      entry_close_date: null,
      entry_count: 0,
      results_visible: false,
    }));
  }, [allTrials]);

  // Group by stage
  const trialsByStage = useMemo(() => {
    const map = new Map<PipelineStage, TrialPipelineData[]>();
    for (const s of PIPELINE_STAGES) map.set(s, []);
    for (const t of pipelineTrials) {
      const bucket = map.get(t.pipeline_stage) ?? [];
      bucket.push(t);
      map.set(t.pipeline_stage, bucket);
    }
    return map;
  }, [pipelineTrials]);

  // Progress per trial (placeholder -- real progress needs DB data)
  const checklistProgressMap = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const t of pipelineTrials) {
      const cannedCount = getCannedItemsForStage(t.pipeline_stage).length;
      map.set(t.id, { completed: 0, total: cannedCount });
    }
    return map;
  }, [pipelineTrials]);

  if (isLoading) {
    return (
      <SecretaryLayout>
        <DelightfulLoading message="Loading mission control..." />
      </SecretaryLayout>
    );
  }

  return (
    <SecretaryLayout>
      <div className="space-y-6 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
            <p className="text-muted-foreground mt-1">
              {statistics.activeTrials} active trial
              {statistics.activeTrials !== 1 ? 's' : ''} &bull; {statistics.totalEntries}{' '}
              total entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(true)}>
              <Copy className="h-4 w-4 mr-1.5" />
              Clone Show
            </Button>
            <Button size="sm" onClick={() => navigate('/secretary/create-show/wizard')}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Show
            </Button>
          </div>
        </div>

        {/* Compact stats bar */}
        <StatisticsCards statistics={statistics} totalTrialsCount={allTrials.length} />

        {/* Main content: Pipeline + Sidebar */}
        <div className="flex gap-6">
          {/* Kanban pipeline */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-3 pb-4 min-w-0">
              {PIPELINE_STAGES.map((stage) => (
                <PipelineColumn
                  key={stage}
                  stage={stage}
                  trials={trialsByStage.get(stage) ?? []}
                  checklistProgressMap={checklistProgressMap}
                />
              ))}
            </div>
          </div>

          {/* Mission control sidebar */}
          <MissionControlSidebar statistics={statistics} activeTrials={activeTrials} />
        </div>

        <ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
      </div>
    </SecretaryLayout>
  );
};

export default PipelineDashboard;
