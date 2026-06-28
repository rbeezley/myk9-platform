/* eslint-disable react-refresh/only-export-components */
/**
 * Shared helpers for Results Control sub-components.
 */

import { type ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, Clock, Lock } from 'lucide-react';
import {
  PRESET_INFO,
  detectPreset,
  fieldTimingsFromVisibility,
  resolveVisibilityCascade,
  type VisibilityPreset,
  type VisibilityTiming,
  type VisibilityOverride,
  type VisibilitySettings,
} from '@myk9/secretary';
import { TIMING_LABELS } from '@/components/secretary/settingsConstants';

// Preset icons speak the semantic status tokens (each carries a dark-mode
// value) rather than raw Tailwind palette colors, which had no dark variant and
// sat outside the status vocabulary: open = success (live now), standard = info
// (scheduled), review = warning (held for review).
export const PRESET_ICONS: Record<VisibilityPreset, ReactNode> = {
  open: <Zap className="h-5 w-5 text-success" />,
  standard: <Clock className="h-5 w-5 text-info" />,
  review: <Lock className="h-5 w-5 text-warning" />,
};

export const ALL_TIMINGS: VisibilityTiming[] = ['immediate', 'class_complete', 'manual_release'];
export const PLACEMENT_TIMINGS: VisibilityTiming[] = ['class_complete', 'manual_release'];

interface TimingSelectProps {
  value: VisibilityTiming;
  timings: VisibilityTiming[];
  onChange: (value: VisibilityTiming) => void;
  disabled?: boolean;
  /** Accessible name for the trigger — the visible field label is a separate element. */
  ariaLabel?: string;
}

export function TimingSelect({
  value,
  timings,
  onChange,
  disabled = false,
  ariaLabel,
}: TimingSelectProps) {
  return (
    <Select value={value} onValueChange={v => onChange(v as VisibilityTiming)} disabled={disabled}>
      <SelectTrigger className="w-40" aria-label={ariaLabel}>
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

/**
 * Human-readable label for the preset an *inheriting* trial or class currently
 * resolves to, walking the show → trial cascade — the same resolution the page
 * uses for `hasManualReleaseClasses`. Pass the parent trial's override to
 * resolve a class's inherited value; omit it for a trial inheriting straight
 * from the show. An empty/undefined override contributes nothing, so the result
 * falls through to the show preset.
 *
 * Returns the preset title (e.g. "After Class"), or "Custom" when the resolved
 * timings match no named preset (a per-field show configuration).
 */
export function resolveInheritedPresetLabel(
  show: VisibilitySettings,
  trialOverride?: VisibilityOverride
): string {
  const resolved = resolveVisibilityCascade(show, trialOverride);
  const preset = detectPreset(fieldTimingsFromVisibility(resolved));
  return preset ? PRESET_INFO[preset].title : 'Custom';
}
