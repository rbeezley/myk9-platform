/**
 * PresetSelector — 3 clickable preset cards + advanced per-field timing accordion.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  PRESET_INFO,
  PRESET_CONFIGS,
  type VisibilityPreset,
  type FieldTimings,
  detectPreset,
  fieldTimingsFromVisibility,
} from '@myk9/secretary';
import { useUpdateShowVisibility } from '@/hooks/mutations/useShowSettingsMutations';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';
import { PRESET_ICONS, ALL_TIMINGS, PLACEMENT_TIMINGS, TimingSelect } from './resultsControlUtils';

interface PresetSelectorProps {
  showId: string;
  settings: ShowSettings;
}

export function PresetSelector({ showId, settings }: PresetSelectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const updateVisibility = useUpdateShowVisibility();

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
    fieldTimingsFromVisibility(settings.visibility)
  );

  const [prevKey, setPrevKey] = useState(serverTimingsKey);
  if (serverTimingsKey !== prevKey) {
    setPrevKey(serverTimingsKey);
    setCustomTimings(fieldTimingsFromVisibility(settings.visibility));
  }

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

  const activePreset = detectPreset(fieldTimingsFromVisibility(settings.visibility));

  return (
    <div className="space-y-4">
      {/* Preset cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(preset => {
          const info = PRESET_INFO[preset];
          const isActive = activePreset === preset;
          return (
            <Card
              key={preset}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`Apply "${info.title}" preset`}
              className={`cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isActive ? 'ring-2 ring-primary' : 'hover:border-primary/50'}`}
              onClick={() => applyPreset(preset)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  applyPreset(preset);
                }
              }}
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
                    ariaLabel={`${label} visibility timing`}
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
    </div>
  );
}
