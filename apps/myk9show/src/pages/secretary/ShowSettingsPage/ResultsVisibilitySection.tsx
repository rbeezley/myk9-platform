/**
 * Results Visibility Section
 *
 * Preset cards (Open / Standard / Review) plus an Advanced accordion
 * for per-field timing overrides and per-trial override controls.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Zap, Clock, Lock, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  PRESET_INFO,
  PRESET_CONFIGS,
  type VisibilityPreset,
  type VisibilityTiming,
} from '@myk9/secretary';
import { TIMING_LABELS } from '@/components/secretary/settingsConstants';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import {
  useUpdateShowVisibility,
  useUpdateTrialOverride,
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import { getClassName } from '@/components/classes/types/classTypes';

// --- helpers ---

const PRESET_ICONS: Record<VisibilityPreset, React.ReactNode> = {
  open: <Zap className="h-5 w-5 text-green-500" />,
  standard: <Clock className="h-5 w-5 text-blue-500" />,
  review: <Lock className="h-5 w-5 text-orange-500" />,
};

const ALL_TIMINGS: VisibilityTiming[] = ['immediate', 'class_complete', 'manual_release'];
const PLACEMENT_TIMINGS: VisibilityTiming[] = ['class_complete', 'manual_release'];

/** Check if an override has any visibility field set (non-null) */
function hasVisibilityOverride(ov: VisibilityOverride): boolean {
  return (
    ov.preset !== undefined ||
    ov.placement !== undefined ||
    ov.qualification !== undefined ||
    ov.time !== undefined ||
    ov.faults !== undefined
  );
}

/** Detect which preset (if any) matches the given field timings */
function detectPreset(timings: FieldTimings): VisibilityPreset | null {
  for (const [name, cfg] of Object.entries(PRESET_CONFIGS)) {
    if (
      cfg.placement === timings.placement &&
      cfg.qualification === timings.qualification &&
      cfg.time === timings.time &&
      cfg.faults === timings.faults
    ) {
      return name as VisibilityPreset;
    }
  }
  return null;
}

interface TimingSelectProps {
  value: VisibilityTiming;
  timings: VisibilityTiming[];
  onChange: (value: VisibilityTiming) => void;
  disabled?: boolean;
}

function TimingSelect({ value, timings, onChange, disabled = false }: TimingSelectProps) {
  return (
    <Select value={value} onValueChange={v => onChange(v as VisibilityTiming)} disabled={disabled}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {timings.map(t => (
          <SelectItem key={t} value={t}>
            {TIMING_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Advanced field-timing state ---

interface FieldTimings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}

function fieldTimingsFromSettings(settings: ShowSettings['visibility']): FieldTimings {
  return {
    placement: settings.placement,
    qualification: settings.qualification,
    time: settings.time,
    faults: settings.faults,
  };
}

// --- Main component ---

interface ResultsVisibilitySectionProps {
  showId: string;
  settings: ShowSettings;
  trialOverrides: TrialOverrideEntry[];
  classOverrides: ClassOverrideEntry[];
  trials: SyncableTrial[];
  classes: SyncableClassData[];
}

export function ResultsVisibilitySection({
  showId,
  settings,
  trialOverrides,
  classOverrides,
  trials,
  classes,
}: ResultsVisibilitySectionProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Derive a stable key from server visibility settings so local state resets
  // when server data changes (e.g., after mutation settles)
  const serverTimingsKey = useMemo(
    () =>
      `${settings.visibility.placement}|${settings.visibility.qualification}|${settings.visibility.time}|${settings.visibility.faults}`,
    [
      settings.visibility.placement,
      settings.visibility.qualification,
      settings.visibility.time,
      settings.visibility.faults,
    ]
  );

  const [customTimings, setCustomTimings] = useState<FieldTimings>(() =>
    fieldTimingsFromSettings(settings.visibility)
  );

  // Reset local custom timings when server data changes
  const [prevKey, setPrevKey] = useState(serverTimingsKey);
  if (serverTimingsKey !== prevKey) {
    setPrevKey(serverTimingsKey);
    setCustomTimings(fieldTimingsFromSettings(settings.visibility));
  }

  const updateVisibility = useUpdateShowVisibility();
  const updateTrialOverride = useUpdateTrialOverride();
  const updateClassOverride = useUpdateClassOverride();
  const resetOverride = useResetOverride();

  function applyPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateVisibility.mutate(
      {
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success(`Applied "${PRESET_INFO[preset].title}" preset`),
        onError: () => toast.error('Failed to update visibility settings'),
      }
    );
    setCustomTimings(cfg);
  }

  function applyCustomTimings() {
    // Detect if custom timings match a known preset; fall back to 'standard' for DB constraint
    const matched = detectPreset(customTimings);
    updateVisibility.mutate(
      {
        showId,
        preset: matched ?? 'standard',
        placementTiming: customTimings.placement,
        qualificationTiming: customTimings.qualification,
        timeTiming: customTimings.time,
        faultsTiming: customTimings.faults,
      },
      {
        onSuccess: () => toast.success('Visibility settings saved'),
        onError: () => toast.error('Failed to update visibility settings'),
      }
    );
  }

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

  // Determine active preset from actual field values, not stored preset label
  const activePreset = detectPreset(fieldTimingsFromSettings(settings.visibility));

  return (
    <div className="space-y-6">
      {/* Preset cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(preset => {
          const info = PRESET_INFO[preset];
          const isActive = activePreset === preset;
          return (
            <Card
              key={preset}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
              onClick={() => applyPreset(preset)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {PRESET_ICONS[preset]}
                  <CardTitle className="text-base">{info.title}</CardTitle>
                </div>
                <CardDescription className="text-xs">{info.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">{info.details}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Advanced accordion */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
            Advanced
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <Card>
            <CardContent className="pt-4 space-y-4">
              {(
                [
                  { field: 'placement', label: 'Placement', timings: PLACEMENT_TIMINGS },
                  { field: 'qualification', label: 'Qualification', timings: ALL_TIMINGS },
                  { field: 'time', label: 'Time', timings: ALL_TIMINGS },
                  { field: 'faults', label: 'Faults', timings: ALL_TIMINGS },
                ] as const
              ).map(({ field, label, timings }) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{label}</span>
                  <TimingSelect
                    value={customTimings[field]}
                    timings={timings}
                    onChange={v => setCustomTimings(prev => ({ ...prev, [field]: v }))}
                  />
                </div>
              ))}
              <Button size="sm" onClick={applyCustomTimings} disabled={updateVisibility.isPending}>
                Save Custom Timings
              </Button>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Trial overrides */}
      {trials.length > 0 && (
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
                    {hasOverride
                      ? `Override: ${currentPreset ?? 'custom'}`
                      : 'Inheriting from show'}
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
      )}

      {/* Class overrides */}
      {classes.length > 0 && (
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
                    const hasOverride = override && hasVisibilityOverride(override.override);
                    const currentPreset = override?.override.preset ?? null;

                    return (
                      <div
                        key={cls.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
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
      )}
    </div>
  );
}
