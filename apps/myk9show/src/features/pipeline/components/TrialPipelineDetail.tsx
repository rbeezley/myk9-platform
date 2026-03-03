import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, ChevronLeft, Lock } from 'lucide-react';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { useTrialStore } from '@/store/trialStore';
import { useAuth } from '@/hooks/useAuth';
import { StageNavigation } from './StageNavigation';
import { ChecklistSection } from './ChecklistSection';
import { ActivityLogFeed } from './ActivityLogFeed';
import { ChecklistPanelRouter } from './panels/ChecklistPanelRouter';
import { ScoringDaySummary } from './ScoringDaySummary';
import { useTrialChecklist, useCanAdvanceStage } from '../hooks/useTrialChecklist';
import { usePipelineMutations } from '../hooks/usePipelineMutations';
import { STAGE_META } from '../constants';
import type { PipelineStage, ChecklistEvalContext } from '../types';

export const TrialPipelineDetail: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const getTrialById = useTrialStore((s) => s.getTrialById);

  const trial = trialId ? getTrialById(trialId) : null;
  const pipelineStage = (
    (trial as unknown as { pipeline_stage?: number })?.pipeline_stage ?? 1
  ) as PipelineStage;
  const [viewingStage, setViewingStage] = useState<PipelineStage>(pipelineStage);
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // Build evaluation context
  const evalCtx = useMemo<ChecklistEvalContext | undefined>(() => {
    if (!trial) return undefined;
    return {
      trial: {
        id: trial.id,
        show_id: trial.showId,
        name: trial.name ?? '',
        date: trial.trialDate,
        pipeline_stage: pipelineStage,
        status: trial.status,
        venue_name: null,
        planned_start_time: trial.plannedStartTime ?? null,
        judge_count: 0,
        has_fee_schedule: false,
        entry_open_date: null,
        entry_close_date: null,
        entry_count: 0,
        results_visible: false,
      },
      classes: [],
      entries: [],
      hasRunningOrder: false,
      hasConflicts: false,
      hasWaitlist: false,
    };
  }, [trial, pipelineStage]);

  const { data: checklistItems } = useTrialChecklist(trialId, viewingStage, evalCtx);
  const canAdvance = useCanAdvanceStage(checklistItems);
  const mutations = usePipelineMutations(trialId ?? '');

  const isViewingCurrentStage = viewingStage === pipelineStage;
  const isReadOnly = viewingStage < pipelineStage || pipelineStage === 6;
  const stageMeta = STAGE_META[viewingStage];

  if (!trial) {
    return (
      <SecretaryLayout>
        <DelightfulLoading message="Loading trial..." />
      </SecretaryLayout>
    );
  }

  const handleToggle = (key: string, completed: boolean) => {
    if (!user) return;
    mutations.toggleItem.mutate({ itemKey: key, completed, userId: user.id });
  };

  const handleAddCustom = (label: string) => {
    if (!user) return;
    mutations.addCustomItem.mutate({
      label,
      stage: viewingStage,
      userId: user.id,
      userName: user.email ?? 'Unknown',
    });
  };

  const handleDeleteCustom = (key: string) => {
    if (!user) return;
    mutations.deleteCustomItem.mutate({
      itemKey: key,
      userId: user.id,
      userName: user.email ?? 'Unknown',
    });
  };

  const handleAdvance = () => {
    if (!user || !canAdvance) return;
    mutations.advanceStage.mutate({
      currentStage: pipelineStage,
      userId: user.id,
      userName: user.email ?? 'Unknown',
    });
  };

  return (
    <SecretaryLayout>
      <div className="space-y-6 pt-6 max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2"
          onClick={() => navigate('/secretary/dashboard')}
        >
          <ChevronLeft className="h-4 w-4" />
          Mission Control
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {trial.name ?? `Trial ${trial.trialNumber}`}
          </h1>
          <p className="text-muted-foreground">
            {new Date(trial.trialDate).toLocaleDateString()} &mdash; {stageMeta.label}
          </p>
        </div>

        <StageNavigation
          currentStage={pipelineStage}
          viewingStage={viewingStage}
          onSelectStage={setViewingStage}
        />

        {!isViewingCurrentStage && (
          <button
            onClick={() => setViewingStage(pipelineStage)}
            className="text-xs text-primary hover:underline"
          >
            <ArrowLeft className="h-3 w-3 inline mr-1" />
            Return to current stage ({STAGE_META[pipelineStage].label})
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{stageMeta.label} Checklist</CardTitle>
                <p className="text-sm text-muted-foreground">{stageMeta.description}</p>
              </CardHeader>
              <CardContent>
                {viewingStage === 4 && evalCtx && evalCtx.classes.length > 0 && (
                  <ScoringDaySummary
                    trialId={trialId!}
                    showId={trial.showId}
                    classes={evalCtx.classes}
                  />
                )}

                <ChecklistSection
                  items={checklistItems ?? []}
                  onToggle={handleToggle}
                  onDeleteCustom={handleDeleteCustom}
                  onAddCustom={handleAddCustom}
                  onNavigate={setActivePanel}
                  disabled={isReadOnly}
                />

                {isViewingCurrentStage && pipelineStage < 6 && (
                  <div className="mt-6 pt-4 border-t border-border/40">
                    <Button
                      onClick={handleAdvance}
                      disabled={!canAdvance || mutations.advanceStage.isPending}
                      className="gap-1.5"
                    >
                      Advance to{' '}
                      {STAGE_META[(pipelineStage + 1) as PipelineStage]?.label ?? 'Next'}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {!canAdvance && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Complete all required items to advance.
                      </p>
                    )}
                  </div>
                )}

                {isReadOnly && viewingStage < pipelineStage && (
                  <div className="mt-6 pt-4 border-t border-border/40">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => {
                        if (!user) return;
                        mutations.revertStage.mutate({
                          targetStage: viewingStage,
                          userId: user.id,
                          userName: user.email ?? 'Unknown',
                        });
                      }}
                      disabled={mutations.revertStage.isPending}
                    >
                      <Lock className="h-3 w-3" />
                      Unlock for editing
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <ActivityLogFeed trialId={trialId!} />
          </div>
        </div>
      </div>

      <ChecklistPanelRouter
        panelKey={activePanel}
        trialId={trialId!}
        showId={trial.showId}
        onClose={() => setActivePanel(null)}
      />
    </SecretaryLayout>
  );
};

export default TrialPipelineDetail;
