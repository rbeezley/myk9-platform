import { Grid3X3, Table2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  grid: Grid3X3,
  table: Table2,
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
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm font-medium text-muted-foreground">View:</span>
      <div className="flex bg-muted/50 rounded-lg p-1 gap-0.5">
        {modes.map((mode) => {
          const Icon = iconMap[mode.icon];
          return (
            <button
              key={mode.key}
              className={cn(
                'h-10 px-3 text-sm inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
                active === mode.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onChange(mode.key)}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
