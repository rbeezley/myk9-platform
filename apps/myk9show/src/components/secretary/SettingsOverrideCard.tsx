/**
 * SettingsOverrideCard
 *
 * A compact card displayed on trial/class detail pages that shows the
 * inherited visibility state and allows secretaries to apply per-trial or
 * per-class overrides without leaving the page.
 *
 * At trial level: uses useUpdateTrialOverride + trial_visibility_overrides
 * At class level: uses useUpdateClassOverride + class_visibility_overrides
 *
 * Resetting sets all nullable columns to NULL (not DELETE) so the row
 * exists but fully inherits from the parent level.
 */

import React, { useId } from 'react';
import { RotateCcw, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select/select';
import { Switch } from '@/components/ui/switch/switch';
import {
  PRESET_INFO,
  PRESET_CONFIGS,
  type VisibilityPreset,
  type VisibilitySettings,
  type VisibilityTiming,
  type ResultField,
} from '@myk9/secretary';
import { TIMING_LABELS, RESULT_FIELDS } from './settingsConstants';
import {
  useUpdateTrialOverride,
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SettingsOverrideCardProps {
  level: 'trial' | 'class';
  entityId: string;
  showId: string;
  /** Required for class-level cards so trial-level cache can be invalidated */
  trialId?: string;
  /** Resolved (effective) settings for this entity after cascade */
  currentSettings: VisibilitySettings;
  selfCheckinEnabled: boolean;
  isLoading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRESETS = (['open', 'standard', 'review'] as VisibilityPreset[]).map(p => ({
  value: p,
  ...PRESET_INFO[p],
}));

function inheritedFromLabel(level: 'trial' | 'class', inheritedFrom?: string): string {
  if (!inheritedFrom) return 'Inherited from show';
  const map: Record<string, string> = {
    show: 'Inherited from show',
    trial: level === 'class' ? 'Inherited from trial' : 'Show default',
    class: 'Class override active',
  };
  return map[inheritedFrom] ?? 'Inherited';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SettingsOverrideCard: React.FC<SettingsOverrideCardProps> = ({
  level,
  entityId,
  showId,
  trialId,
  currentSettings,
  selfCheckinEnabled,
  isLoading = false,
}) => {
  const switchId = useId();

  // Mutations
  const updateTrialOverride = useUpdateTrialOverride();
  const updateClassOverride = useUpdateClassOverride();
  const resetOverride = useResetOverride();

  const isMutating =
    updateTrialOverride.isPending ||
    updateClassOverride.isPending ||
    resetOverride.isPending ||
    isLoading;

  // ── Preset apply ─────────────────────────────────────────────────────────

  function applyPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    if (level === 'trial') {
      updateTrialOverride.mutate({
        trialId: entityId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      });
    } else {
      updateClassOverride.mutate({
        classId: entityId,
        trialId: trialId ?? '',
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      });
    }
  }

  // ── Per-field timing override ─────────────────────────────────────────────

  function applyFieldOverride(field: ResultField, timing: VisibilityTiming) {
    if (level === 'trial') {
      updateTrialOverride.mutate({
        trialId: entityId,
        showId,
        [`${field}Timing`]: timing,
      } as Parameters<typeof updateTrialOverride.mutate>[0]);
    } else {
      updateClassOverride.mutate({
        classId: entityId,
        trialId: trialId ?? '',
        showId,
        [`${field}Timing`]: timing,
      } as Parameters<typeof updateClassOverride.mutate>[0]);
    }
  }

  // ── Check-in toggle ───────────────────────────────────────────────────────

  function handleCheckinToggle(checked: boolean) {
    if (level === 'trial') {
      updateTrialOverride.mutate({
        trialId: entityId,
        showId,
        selfCheckinEnabled: checked,
      });
    } else {
      updateClassOverride.mutate({
        classId: entityId,
        trialId: trialId ?? '',
        showId,
        selfCheckinEnabled: checked,
      });
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  function handleReset() {
    resetOverride.mutate({ entityId, showId, level });
  }

  const inheritedLabel = inheritedFromLabel(level, currentSettings.inheritedFrom);
  const hasOverride = currentSettings.inheritedFrom === level;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Visibility Settings</CardTitle>
          </div>
          {hasOverride && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleReset}
              disabled={isMutating}
              title="Reset to inherited settings"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{inheritedLabel}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Preset selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Apply preset</label>
          <Select<VisibilityPreset>
            value={currentSettings.preset ?? undefined}
            onValueChange={applyPreset}
          >
            <SelectTrigger className="h-8 text-xs" disabled={isMutating}>
              <SelectValue placeholder="Choose a preset…" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  <span className="font-medium">{p.title}</span>
                  <span className="ml-1 text-muted-foreground">— {p.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Per-field overrides */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Per-field overrides</label>
          <div className="grid gap-2">
            {RESULT_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-20 text-xs text-muted-foreground shrink-0">{label}</span>
                <Select<VisibilityTiming>
                  value={currentSettings[key]}
                  onValueChange={timing => applyFieldOverride(key, timing)}
                >
                  <SelectTrigger className="h-7 flex-1 text-xs" disabled={isMutating}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIMING_LABELS) as VisibilityTiming[]).map(t => (
                      <SelectItem key={t} value={t} className="text-xs">
                        {TIMING_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {/* Check-in toggle */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div>
            <label
              htmlFor={switchId}
              className="text-xs font-medium text-foreground cursor-pointer"
            >
              Self check-in
            </label>
            <p className="text-xs text-muted-foreground">Allow exhibitors to check themselves in</p>
          </div>
          <Switch
            id={switchId}
            checked={selfCheckinEnabled}
            onCheckedChange={handleCheckinToggle}
            disabled={isMutating}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default SettingsOverrideCard;
