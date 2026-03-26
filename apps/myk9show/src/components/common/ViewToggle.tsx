import { LayoutGrid, List, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  grid: LayoutGrid,
  table: List,
  calendar: CalendarDays,
} as const;

interface ViewMode {
  key: string;
  label: string;
  icon: keyof typeof iconMap;
}

interface ViewToggleProps {
  modes: readonly ViewMode[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function ViewToggle({ modes, active, onChange, className }: ViewToggleProps) {
  if (modes.length <= 1) return null;

  return (
    <div className={cn('flex items-center border rounded-lg overflow-hidden', className)}>
      {modes.map(mode => {
        const Icon = iconMap[mode.icon];
        return (
          <button
            key={mode.key}
            type="button"
            className={cn(
              'p-2 transition-colors',
              active === mode.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
            title={`${mode.label} view`}
            onClick={() => onChange(mode.key)}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
