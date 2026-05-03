import { LayoutGrid, List, Table2, CalendarDays, Network } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  grid: LayoutGrid,
  list: List,
  table: Table2,
  calendar: CalendarDays,
  flow: Network,
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
        const isActive = active === mode.key;
        return (
          <button
            key={mode.key}
            type="button"
            aria-label={`${mode.label} view`}
            title={`${mode.label} view`}
            onClick={() => onChange(mode.key)}
            className={cn(
              'p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
