/**
 * StatChip — Compact inline stat display for context rows.
 */

import { cn } from '@/lib/utils';

interface StatChipProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBgClass?: string;
}

export const StatChip: React.FC<StatChipProps> = ({
  icon,
  value,
  label,
  iconBgClass = 'bg-primary/15',
}) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/60 border border-border/30">
    <div className={cn('p-1 rounded', iconBgClass)}>{icon}</div>
    <div>
      <div className="text-sm font-bold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  </div>
);
