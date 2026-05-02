import { LayoutGrid, List, Table2, CalendarDays, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className={cn('flex bg-muted/50 rounded-lg p-1', className)}>
      {modes.map(mode => {
        const Icon = iconMap[mode.icon];
        return (
          <Button
            key={mode.key}
            type="button"
            variant={active === mode.key ? 'default' : 'ghost'}
            size="default"
            title={`${mode.label} view`}
            onClick={() => onChange(mode.key)}
            className="h-10 px-3 transition-all duration-200"
          >
            <Icon className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{mode.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
