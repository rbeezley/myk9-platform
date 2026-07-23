/**
 * Entry Management display-preset control (spec scenario "Show-day display is
 * selected", Requirement "Display presets preserve safe operational
 * information"). "Show day" gives PRIORITY to armband, dog, class, and
 * check-in information (compact density + armband/checkIn column emphasis in
 * Entry Management displays without hiding anything — identity, current status,
 * selection controls, and row action menus always remain rendered.
 */
import { ListChecks, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ENTRY_DISPLAY_PRESET_VALUES,
  type EntryDisplayPreset,
} from '@/features/operational-views/operationalViews';

interface EntryDisplayPresetControlProps {
  preset: EntryDisplayPreset;
  onChange: (preset: EntryDisplayPreset) => void;
}

const PRESET_LABELS: Record<EntryDisplayPreset, string> = {
  standard: 'Standard',
  'show-day': 'Show day',
};

const PRESET_ICONS: Record<EntryDisplayPreset, typeof Sun> = {
  standard: ListChecks,
  'show-day': Sun,
};

export function EntryDisplayPresetControl({ preset, onChange }: EntryDisplayPresetControlProps) {
  return (
    <div
      role="group"
      aria-label="Display preset"
      className="inline-flex items-center rounded-md border border-input p-0.5"
    >
      {ENTRY_DISPLAY_PRESET_VALUES.map(value => {
        const Icon = PRESET_ICONS[value];
        const isActive = preset === value;
        return (
          <Button
            key={value}
            type="button"
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={isActive}
            className="h-8 gap-1.5 px-2"
            onClick={() => onChange(value)}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{PRESET_LABELS[value]}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default EntryDisplayPresetControl;
