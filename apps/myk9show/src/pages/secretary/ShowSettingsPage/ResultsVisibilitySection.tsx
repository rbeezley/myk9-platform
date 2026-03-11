/**
 * Results Visibility Section
 *
 * Preset cards (Open / Standard / Review) plus an Advanced accordion
 * for per-field timing overrides and per-trial override controls.
 */

import { useState, useEffect } from 'react';
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
import type { ShowSettings, TrialOverrideEntry } from '@/hooks/queries/useShowSettingsDatabase';
import {
  useUpdateShowVisibility,
  useUpdateTrialOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type { SyncableTrial } from '@/store/trial-store-types';

// --- helpers ---

const PRESET_ICONS: Record<VisibilityPreset, React.ReactNode> = {
  open: <Zap className="h-5 w-5 text-green-500" />,
  standard: <Clock className="h-5 w-5 text-blue-500" />,
  review: <Lock className="h-5 w-5 text-orange-500" />,
};

const ALL_TIMINGS: VisibilityTiming[] = ['immediate', 'class_complete', 'manual_release'];
const PLACEMENT_TIMINGS: VisibilityTiming[] = ['class_complete', 'manual_release'];

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
  trials: SyncableTrial[];
}

export function ResultsVisibilitySection({
  showId,
  settings,
  trialOverrides,
  trials,
}: ResultsVisibilitySectionProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customTimings, setCustomTimings] = useState<FieldTimings>(() =>
    fieldTimingsFromSettings(settings.visibility)
  );

  // Sync with server data when it changes (e.g., after mutation settles)
  useEffect(() => {
    setCustomTimings(fieldTimingsFromSettings(settings.visibility));
  }, [
    settings.visibility.placement,
    settings.visibility.qualification,
    settings.visibility.time,
    settings.visibility.faults,
  ]);

  const updateVisibility = useUpdateShowVisibility();
  const updateTrialOverride = useUpdateTrialOverride();
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
            const hasOverride =
              override &&
              (override.override.preset !== undefined ||
                override.override.placement !== undefined ||
                override.override.qualification !== undefined ||
                override.override.time !== undefined ||
                override.override.faults !== undefined);

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
    </div>
  );
}
