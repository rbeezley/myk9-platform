/**
 * ClassOverrides — per-class preset dropdowns grouped by trial, with checkboxes for bulk selection.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import {
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type {
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import { getClassName } from '@/components/classes/types/classTypes';
import { hasVisibilityOverride } from './resultsControlUtils';

interface ClassOverridesProps {
  showId: string;
  trials: SyncableTrial[];
  classes: SyncableClassData[];
  classOverrides: ClassOverrideEntry[];
  trialOverrides: TrialOverrideEntry[];
  selectedClasses: Set<string>;
  onToggleClass: (classId: string) => void;
  onToggleAllInTrial: (trialId: string, classIds: string[]) => void;
}

export function ClassOverrides({
  showId,
  trials,
  classes,
  classOverrides,
  trialOverrides,
  selectedClasses,
  onToggleClass,
  onToggleAllInTrial,
}: ClassOverridesProps) {
  const updateClassOverride = useUpdateClassOverride();
  const resetOverride = useResetOverride();

  if (classes.length === 0) return null;

  function handleClassPreset(classId: string, trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateClassOverride.mutate(
      {
        classId,
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Class override saved'),
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
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Class Overrides</h3>
      {trials.map(trial => {
        const trialClasses = classes.filter(c => c.trialId === trial.id);
        if (trialClasses.length === 0) return null;

        const trialHasOverride = trialOverrides.some(o => o.trialId === trial.id);
        const overrideCount = trialClasses.filter(c =>
          classOverrides.some(o => o.classId === c.id && hasVisibilityOverride(o.override))
        ).length;
        const trialClassIds = trialClasses.map(c => c.id);
        const allSelected = trialClassIds.every(id => selectedClasses.has(id));

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
              {/* Select all for trial */}
              <div className="flex items-center gap-2 px-3 py-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleAllInTrial(trial.id, trialClassIds)}
                  aria-label={`Select all classes in ${trial.name}`}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {trialClasses.map(cls => {
                const override = classOverrides.find(o => o.classId === cls.id);
                const hasOverride = override && hasVisibilityOverride(override.override);
                const currentPreset = override?.override.preset ?? null;

                return (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedClasses.has(cls.id)}
                        onCheckedChange={() => onToggleClass(cls.id)}
                        aria-label={`Select ${getClassName(cls)}`}
                      />
                      <div>
                        <p className="text-sm font-medium">{getClassName(cls)}</p>
                        <p className="text-xs text-muted-foreground">
                          {hasOverride
                            ? `Override: ${currentPreset ?? 'custom'}`
                            : trialHasOverride
                              ? 'Inheriting from trial'
                              : 'Inheriting from show'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentPreset ?? ''}
                        onValueChange={v =>
                          handleClassPreset(cls.id, trial.id, v as VisibilityPreset)
                        }
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
  );
}
