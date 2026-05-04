import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, ChevronLeft, FileText, Lock } from 'lucide-react';
import { GeneratePremiumPanel } from '@/features/premium/GeneratePremiumPanel';
import { useShowStore } from '@/store/showStore';
import DelightfulLoading from '@/components/ui/DelightfulLoading';
import { useTrialStore } from '@/store/trialStore';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/database/supabaseClient';
import { StageNavigation } from './StageNavigation';
import { ChecklistSection } from './ChecklistSection';
import { ActivityLogFeed } from './ActivityLogFeed';
import { ChecklistPanelRouter } from './panels/ChecklistPanelRouter';
import { ScoringDaySummary } from './ScoringDaySummary';
import { useTrialChecklist, canAdvanceStage } from '../hooks/useTrialChecklist';
import { usePipelineMutations } from '../hooks/usePipelineMutations';
import { STAGE_META } from '../constants';
import type { PipelineStage, PanelKey, ChecklistEvalContext } from '../types';
import { SettingsOverrideCard } from '@/components/secretary/SettingsOverrideCard';
import { useShowSettings, useTrialOverrides } from '@/hooks/queries/useShowSettingsDatabase';
import { resolveVisibilityCascade, resolveCheckinCascade } from '@myk9/secretary';

export const TrialPipelineDetail: React.FC = () => {
  const { trialId } = useParams<{ trialId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const getTrialById = useTrialStore(s => s.getTrialById);

  const trial = trialId ? getTrialById(trialId) : null;
  // Cast needed: pipeline_stage not yet in SyncableTrial type
  const pipelineStage = ((trial as unknown as { pipeline_stage?: number })?.pipeline_stage ??
    1) as PipelineStage;
  const [viewingStage, setViewingStage] = useState<PipelineStage>(pipelineStage);
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const [premiumPanelOpen, setPremiumPanelOpen] = useState(false);

  // Show settings + trial overrides — declared before evalCtx so hooks run unconditionally.
  const showId = trial?.showId ?? null;
  const getShowById = useShowStore(s => s.getShowById);
  const show = showId ? getShowById(showId) : null;

  // Judge count from judge_assignments for this show (show-level assignment from wizard)
  const { data: judgeCount = 0 } = useQuery({
    queryKey: ['judge_assignments_count', showId],
    queryFn: async () => {
      if (!showId) return 0;
      const { count } = await supabase
        .from('judge_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('show_id', showId);
      return count ?? 0;
    },
    enabled: !!showId,
    staleTime: 30_000,
  });

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
        judge_count: judgeCount,
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
  }, [trial, pipelineStage, judgeCount]);

  const { data: checklistItems } = useTrialChecklist(trialId, viewingStage, evalCtx);
  const canAdvance = canAdvanceStage(checklistItems);
  const mutations = usePipelineMutations(trialId ?? '');

  const { data: showSettings, isLoading: showSettingsLoading } = useShowSettings(showId);
  const { data: trialOverrides, isLoading: trialOverridesLoading } = useTrialOverrides(showId);

  // Resolve trial-level effective settings client-side
  const trialEffectiveSettings = useMemo(() => {
    if (!showSettings) return null;
    const trialEntry = trialOverrides?.find(o => o.trialId === trialId);
    const trialOverride = trialEntry?.override;
    return {
      visibility: resolveVisibilityCascade(showSettings.visibility, trialOverride),
      selfCheckinEnabled: resolveCheckinCascade(
        showSettings.selfCheckinEnabled,
        trialEntry?.selfCheckinEnabled ?? null,
        null
      ),
    };
  }, [showSettings, trialOverrides, trialId]);

  const isViewingCurrentStage = viewingStage === pipelineStage;
  const isReadOnly = viewingStage < pipelineStage || pipelineStage === 6;
  const stageMeta = STAGE_META[viewingStage];

  if (!trial) {
    return <DelightfulLoading message="Loading trial..." />;
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
    <>
      <div className="space-y-6 px-6 py-4 max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2"
          onClick={() => navigate('/secretary/dashboard')}
        >
          <ChevronLeft className="h-4 w-4" />
          Mission Control
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {trial.name ?? `Trial ${trial.trialNumber}`}
            </h1>
            <p className="text-muted-foreground">
              {new Date(trial.trialDate + 'T00:00:00').toLocaleDateString()} &mdash;{' '}
              {stageMeta.label}
            </p>
          </div>
          {show && (show.organization === 'AKC' || show.organization === 'UKC') && (
            <Button variant="outline" size="sm" onClick={() => setPremiumPanelOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Generate Premium
            </Button>
          )}
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
                  <ScoringDaySummary classes={evalCtx.classes} />
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
                      Advance to {STAGE_META[(pipelineStage + 1) as PipelineStage]?.label ?? 'Next'}
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

            {/* Visibility settings override — shown below the checklist */}
            {trialEffectiveSettings && (
              <div className="mt-4">
                <SettingsOverrideCard
                  level="trial"
                  entityId={trial.id}
                  showId={trial.showId}
                  currentSettings={trialEffectiveSettings.visibility}
                  selfCheckinEnabled={trialEffectiveSettings.selfCheckinEnabled}
                  isLoading={showSettingsLoading || trialOverridesLoading}
                />
              </div>
            )}
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
      <GeneratePremiumPanel
        open={premiumPanelOpen}
        onClose={() => setPremiumPanelOpen(false)}
        showId={trial.showId}
        clubId={show?.clubId ?? ''}
        showOrg={(show?.organization as 'AKC' | 'UKC' | null) ?? null}
      />
    </>
  );
};

export default TrialPipelineDetail;
