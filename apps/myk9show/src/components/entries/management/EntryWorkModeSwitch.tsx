import { ClipboardList, SunMedium, CreditCard, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EntryWorkMode } from './entryManagementFilters';
import type { EntryManagementPresetId } from '@/features/operational-views/operationalViews';

interface EntryWorkModeSwitchProps {
  value: EntryWorkMode;
  onChange: (mode: EntryWorkMode) => void;
  className?: string;
  /**
   * Curated presets that don't map onto the review/day-of work-mode axis
   * (Design Decision 2: "Payment due", "All entries"). Rendered in the same
   * control cluster so there is exactly one preset system — no second menu.
   */
  activeExtraPresetId?: EntryManagementPresetId | null;
  onSelectExtraPreset?: (presetId: EntryManagementPresetId) => void;
}

const MODES: Array<{
  value: EntryWorkMode;
  label: string;
  icon: ReactNode;
}> = [
  { value: 'review', label: 'Review', icon: <ClipboardList className="h-4 w-4" /> },
  { value: 'day-of', label: 'Day-of', icon: <SunMedium className="h-4 w-4" /> },
];

/**
 * The two curated presets that aren't already expressed by a work mode.
 * "Needs review" and "Needs check-in" ARE the review/day-of work modes
 * (see Design Decision 2's "Relationship to the existing Quick View
 * presets") and are rendered via `MODES` above, not duplicated here.
 */
const EXTRA_PRESETS: Array<{
  id: EntryManagementPresetId;
  label: string;
  icon: ReactNode;
}> = [
  { id: 'payment-due', label: 'Payment due', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'all-entries', label: 'All entries', icon: <ListChecks className="h-4 w-4" /> },
];

export function EntryWorkModeSwitch({
  value,
  onChange,
  className,
  activeExtraPresetId = null,
  onSelectExtraPreset,
}: EntryWorkModeSwitchProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Quick view presets"
    >
      {/*
        Labeled as a preset, not a fourth mode axis: each button is a shortcut
        that sets the attention + payment + view filters together. Naming it
        "Quick views" keeps the secretary from reading it as independent state
        that fights the filter row below.
      */}
      <span className="text-xs font-medium text-muted-foreground">Quick views</span>
      {MODES.map(mode => {
        const active = mode.value === value;
        return (
          <Button
            key={mode.value}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            className="h-9 min-w-24 gap-2"
            onClick={() => onChange(mode.value)}
          >
            {mode.icon}
            {mode.label}
          </Button>
        );
      })}
      {onSelectExtraPreset &&
        EXTRA_PRESETS.map(preset => {
          const active = preset.id === activeExtraPresetId;
          return (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              className="h-9 min-w-24 gap-2"
              onClick={() => onSelectExtraPreset(preset.id)}
            >
              {preset.icon}
              {preset.label}
            </Button>
          );
        })}
    </div>
  );
}
