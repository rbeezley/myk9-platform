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
import { PRESET_CONFIGS, type VisibilityPreset, type VisibilityTiming } from '@myk9/secretary';
import { TIMING_LABELS } from '@/components/secretary/settingsConstants';
import type { VisibilityOverride } from '@myk9/secretary';

export const PRESET_ICONS: Record<VisibilityPreset, ReactNode> = {
  open: <Zap className="h-5 w-5 text-green-500" />,
  standard: <Clock className="h-5 w-5 text-blue-500" />,
  review: <Lock className="h-5 w-5 text-orange-500" />,
};

export const ALL_TIMINGS: VisibilityTiming[] = ['immediate', 'class_complete', 'manual_release'];
export const PLACEMENT_TIMINGS: VisibilityTiming[] = ['class_complete', 'manual_release'];

export interface FieldTimings {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}

export function fieldTimingsFromVisibility(visibility: {
  placement: VisibilityTiming;
  qualification: VisibilityTiming;
  time: VisibilityTiming;
  faults: VisibilityTiming;
}): FieldTimings {
  return {
    placement: visibility.placement,
    qualification: visibility.qualification,
    time: visibility.time,
    faults: visibility.faults,
  };
}

/** Detect which preset (if any) matches the given field timings */
export function detectPreset(timings: FieldTimings): VisibilityPreset | null {
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

/** Check if an override has any visibility field set (non-null) */
export function hasVisibilityOverride(ov: VisibilityOverride): boolean {
  return (
    ov.preset !== undefined ||
    ov.placement !== undefined ||
    ov.qualification !== undefined ||
    ov.time !== undefined ||
    ov.faults !== undefined
  );
}

interface TimingSelectProps {
  value: VisibilityTiming;
  timings: VisibilityTiming[];
  onChange: (value: VisibilityTiming) => void;
  disabled?: boolean;
}

export function TimingSelect({ value, timings, onChange, disabled = false }: TimingSelectProps) {
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
