/**
 * TrialOverrides — per-trial preset dropdown + reset buttons.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import {
  useUpdateTrialOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type { TrialOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import { hasVisibilityOverride } from './resultsControlUtils';

interface TrialOverridesProps {
  showId: string;
  trials: SyncableTrial[];
  trialOverrides: TrialOverrideEntry[];
}

export function TrialOverrides({ showId, trials, trialOverrides }: TrialOverridesProps) {
  const updateTrialOverride = useUpdateTrialOverride();
  const resetOverride = useResetOverride();

  if (trials.length === 0) return null;

  function handleTrialPreset(trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateTrialOverride.mutate(
      {
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Trial override saved'),
        onError: () => toast.error('Failed to save trial override'),
      }
    );
  }

  function handleResetTrial(trialId: string) {
    resetOverride.mutate(
      { entityId: trialId, showId, level: 'trial' },
      {
        onSuccess: () => toast.success('Trial reset to show defaults'),
        onError: () => toast.error('Failed to reset trial override'),
      }
    );
  }

  return (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Trial Overrides</h3>
      {trials.map(trial => {
        const override = trialOverrides.find(o => o.trialId === trial.id);
        const hasOverride = override && hasVisibilityOverride(override.override);
        const currentPreset = override?.override.preset ?? null;

        return (
          <div
            key={trial.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{trial.name}</p>
              <p className="text-xs text-muted-foreground">
                {hasOverride ? `Override: ${currentPreset ?? 'custom'}` : 'Inheriting from show'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={currentPreset ?? ''}
                onValueChange={v => handleTrialPreset(trial.id, v as VisibilityPreset)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Inherit" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(p => (
                    <SelectItem key={p} value={p}>
                      {PRESET_INFO[p].title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasOverride && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Reset to show defaults"
                  onClick={() => handleResetTrial(trial.id)}
                  disabled={resetOverride.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
