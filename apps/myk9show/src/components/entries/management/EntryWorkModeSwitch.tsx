import { ClipboardList, SunMedium } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EntryWorkMode } from './entryManagementFilters';

interface EntryWorkModeSwitchProps {
  value: EntryWorkMode;
  onChange: (mode: EntryWorkMode) => void;
  className?: string;
}

const MODES: Array<{
  value: EntryWorkMode;
  label: string;
  icon: ReactNode;
}> = [
  { value: 'review', label: 'Review', icon: <ClipboardList className="h-4 w-4" /> },
  { value: 'day-of', label: 'Day-of', icon: <SunMedium className="h-4 w-4" /> },
];

export function EntryWorkModeSwitch({ value, onChange, className }: EntryWorkModeSwitchProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      role="group"
      aria-label="Entry work mode"
    >
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
    </div>
  );
}
