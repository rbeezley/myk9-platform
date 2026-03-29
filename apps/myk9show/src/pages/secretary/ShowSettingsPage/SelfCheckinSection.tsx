/**
 * Self Check-In Section
 *
 * Show-level toggle plus per-trial override toggles.
 */

import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCcw, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import {
  useUpdateShowCheckin,
  useUpdateTrialOverride,
  useResetOverride,
  useUpdateClassOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import { getClassName } from '@/components/classes/types/classTypes';

interface SelfCheckinSectionProps {
  showId: string;
  settings: ShowSettings;
  trialOverrides: TrialOverrideEntry[];
  classOverrides: ClassOverrideEntry[];
  trials: SyncableTrial[];
  classes: SyncableClassData[];
}

export function SelfCheckinSection({
  showId,
  settings,
  trialOverrides,
  classOverrides,
  trials,
  classes,
}: SelfCheckinSectionProps) {
  const updateCheckin = useUpdateShowCheckin();
  const updateTrialOverride = useUpdateTrialOverride();
  const resetOverride = useResetOverride();
  const updateClassOverride = useUpdateClassOverride();

  function handleShowToggle(enabled: boolean) {
    updateCheckin.mutate(
      { showId, enabled },
      {
        onSuccess: () =>
          toast.success(`Self check-in ${enabled ? 'enabled' : 'disabled'} for show`),
        onError: () => toast.error('Failed to update check-in setting'),
      }
    );
  }

  function handleTrialToggle(trialId: string, enabled: boolean) {
    updateTrialOverride.mutate(
      { trialId, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => toast.success('Trial check-in override saved'),
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

  function handleClassCheckinToggle(classId: string, trialId: string, enabled: boolean) {
    updateClassOverride.mutate(
      { classId, trialId, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => toast.success('Class check-in override saved'),
        onError: () => toast.error('Failed to save class override'),
      }
    );
  }

  function handleResetClass(classId: string) {
    resetOverride.mutate(
      { entityId: classId, showId, level: 'class' },
      {
        onSuccess: () => toast.success('Class reset to inherited settings'),
        onError: () => toast.error('Failed to reset class override'),
      }
    );
  }

  return (
    <div className="space-y-6">
      {/* Show-level toggle */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Allow Self Check-In</CardTitle>
                <CardDescription className="text-xs">
                  Exhibitors can check themselves in via the app
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.selfCheckinEnabled}
              onCheckedChange={handleShowToggle}
              disabled={updateCheckin.isPending}
            />
          </div>
        </CardHeader>
      </Card>

      {/* Trial overrides */}
      {trials.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h3 className="text-sm font-semibold">Trial Overrides</h3>
          {trials.map(trial => {
            const override = trialOverrides.find(o => o.trialId === trial.id);
            const hasOverride = override && override.selfCheckinEnabled !== null;
            // Effective value: override ?? show setting
            const effective = override?.selfCheckinEnabled ?? settings.selfCheckinEnabled;

            return (
              <div
                key={trial.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{trial.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hasOverride ? 'Override active' : 'Inheriting from show'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={effective}
                    onCheckedChange={v => handleTrialToggle(trial.id, v)}
                    disabled={updateTrialOverride.isPending}
                  />
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
      )}

      {/* Class overrides */}
      {classes.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <h3 className="text-sm font-semibold">Class Overrides</h3>
          {trials.map(trial => {
            const trialClasses = classes.filter(c => c.trialId === trial.id);
            if (trialClasses.length === 0) return null;

            const overrideCount = trialClasses.filter(c =>
              classOverrides.some(o => o.classId === c.id && o.selfCheckinEnabled !== null)
            ).length;

            return (
              <Collapsible key={trial.id}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex w-full items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm font-medium">{trial.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {trialClasses.length} classes
                      {overrideCount > 0 && ` · ${overrideCount} overridden`}
                    </span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pl-3 pt-1">
                  {trialClasses.map(cls => {
                    const override = classOverrides.find(o => o.classId === cls.id);
                    const hasOverride = override && override.selfCheckinEnabled !== null;

                    // Resolve effective value: class ?? trial ?? show
                    const trialOverride = trialOverrides.find(o => o.trialId === trial.id);
                    const trialCheckin = trialOverride?.selfCheckinEnabled ?? null;
                    const effective =
                      override?.selfCheckinEnabled ?? trialCheckin ?? settings.selfCheckinEnabled;

                    const trialHasOverride = trialCheckin !== null;

                    return (
                      <div
                        key={cls.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{getClassName(cls)}</p>
                          <p className="text-xs text-muted-foreground">
                            {hasOverride
                              ? 'Override active'
                              : trialHasOverride
                                ? 'Inheriting from trial'
                                : 'Inheriting from show'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={effective}
                            onCheckedChange={v => handleClassCheckinToggle(cls.id, trial.id, v)}
                            disabled={updateClassOverride.isPending}
                          />
                          {hasOverride && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reset to inherited settings"
                              onClick={() => handleResetClass(cls.id)}
                              disabled={resetOverride.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
