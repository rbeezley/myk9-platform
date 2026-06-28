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
import { type VisibilityPreset, type VisibilityTiming } from '@myk9/secretary';
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
      <SelectTrigger className="min-h-[44px] w-40" aria-label={ariaLabel}>
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
