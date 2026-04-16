import { cn } from '@/lib/utils';

interface FilterChipsProps {
  options: { value: string; label: string }[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterChips({ options, active, onChange, className }: FilterChipsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map(({ value, label }) => (
        <button
          key={value}
          aria-pressed={active === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
            active === value
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-primary/50'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
