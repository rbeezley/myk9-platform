import { useState } from 'react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisibilityPreset } from '@myk9/secretary';
import { PresetSelector } from './PresetSelector';
import { OverrideList } from './OverrideList';
import { useVisibilitySettings } from '@/hooks/queries/useVisibilitySettings';
import {
  useUpdateShowVisibility,
  useUpdateTrialVisibility,
  useUpdateClassVisibility,
} from '@/hooks/mutations/useVisibilityMutations';

interface ShowSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  showId: string;
  trials: { id: string; name: string }[];
  classes: { id: string; trialId: string; name: string }[];
}

export function ShowSettingsPanel({
  open,
  onClose,
  showId,
  trials,
  classes,
}: ShowSettingsPanelProps) {
  const { data } = useVisibilitySettings(showId);
  const updateShow = useUpdateShowVisibility();
  const updateTrial = useUpdateTrialVisibility();
  const updateClass = useUpdateClassVisibility();

  const [trialSectionOpen, setTrialSectionOpen] = useState(false);
  const [classSectionOpen, setClassSectionOpen] = useState(false);

  const showDefaults = data?.showDefaults
    ? {
        preset: data.showDefaults.preset_name as VisibilityPreset,
        selfCheckinEnabled: data.showDefaults.self_checkin_enabled,
      }
    : { preset: 'open' as VisibilityPreset, selfCheckinEnabled: true };

  function handleShowPresetChange(preset: VisibilityPreset) {
    updateShow.mutate({ showId, presetName: preset });
  }

  function handleShowCheckinToggle(enabled: boolean) {
    updateShow.mutate({ showId, selfCheckinEnabled: enabled });
  }

  const trialItems = trials.map(t => {
    const override = data?.trialOverrides.find(r => r.trial_id === t.id);
    return {
      id: t.id,
      label: t.name,
      presetOverride: (override?.preset_name as VisibilityPreset) ?? null,
      selfCheckinOverride: override?.self_checkin_enabled ?? null,
    };
  });

  const classItems = classes.map(c => {
    const override = data?.classOverrides.find(r => r.class_id === c.id);
    return {
      id: c.id,
      label: c.name,
      presetOverride: (override?.preset_name as VisibilityPreset) ?? null,
      selfCheckinOverride: override?.self_checkin_enabled ?? null,
    };
  });

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Show Settings" size="md">
      <div className="space-y-6 p-4">
        {/* Result Visibility Section */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Result Visibility</h3>
          <p className="text-xs text-muted-foreground">
            Controls when exhibitors can see each result field.
          </p>

          <PresetSelector
            value={showDefaults.preset}
            onChange={handleShowPresetChange}
            disabled={updateShow.isPending}
          />

          {trials.length > 0 && (
            <Collapsible open={trialSectionOpen} onOpenChange={setTrialSectionOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', trialSectionOpen && 'rotate-90')}
                />
                Trial Overrides
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <OverrideList
                  items={trialItems}
                  onPresetChange={(id, preset) =>
                    updateTrial.mutate({ trialId: id, showId, presetName: preset })
                  }
                  onReset={id => updateTrial.mutate({ trialId: id, showId, reset: true })}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          {classes.length > 0 && (
            <Collapsible open={classSectionOpen} onOpenChange={setClassSectionOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', classSectionOpen && 'rotate-90')}
                />
                Class Overrides
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <OverrideList
                  items={classItems}
                  onPresetChange={(id, preset) =>
                    updateClass.mutate({ classIds: [id], showId, presetName: preset })
                  }
                  onReset={id => updateClass.mutate({ classIds: [id], showId, reset: true })}
                />
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>

        {/* Self Check-in Section */}
        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">Self Check-in</h3>
          <p className="text-xs text-muted-foreground">
            When enabled, exhibitors can update their own check-in status in the app. When disabled,
            only staff can manage check-in.
          </p>
          <div className="flex items-center gap-3">
            <Switch
              checked={showDefaults.selfCheckinEnabled}
              onCheckedChange={handleShowCheckinToggle}
              disabled={updateShow.isPending}
            />
            <Label className="text-sm">
              {showDefaults.selfCheckinEnabled
                ? 'Exhibitors can self check-in'
                : 'Staff-only check-in'}
            </Label>
          </div>
        </section>
      </div>
    </SlideOverPanel>
  );
}
