import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { FilterDefinition, FilterValue } from './types';

interface FilterPillProps {
  definition: FilterDefinition;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  onRemove: () => void;
}

function displayValue(def: FilterDefinition, value: FilterValue): string {
  if (def.type === 'boolean') return value ? 'Yes' : 'No';

  if (def.type === 'multi-select' && Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.length === 1) {
      const opt = def.options?.find(o => o.value === value[0]);
      return opt?.label || value[0];
    }
    return `${value.length} selected`;
  }

  if (def.type === 'select' && typeof value === 'string') {
    const opt = def.options?.find(o => o.value === value);
    return opt?.label || value;
  }

  return String(value);
}

export function FilterPill({ definition, value, onChange, onRemove }: FilterPillProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const Icon = definition.icon;
  const display = displayValue(definition, value);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="secondary"
          role="status"
          aria-label={`Filter: ${definition.label} is ${display}`}
          className="pl-2 pr-1 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-secondary/80 transition-colors text-sm font-normal"
        >
          {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
          <span className="text-muted-foreground">{definition.label}:</span>
          <span className="font-medium">{display}</span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${definition.label} filter`}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-2" align="start">
        {definition.type === 'text' && (
          <Input
            autoFocus
            placeholder={definition.placeholder || `Filter by ${definition.label.toLowerCase()}...`}
            value={typeof value === 'string' ? value : ''}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') setPopoverOpen(false);
            }}
            className="h-8 text-sm"
          />
        )}

        {definition.type === 'select' && (
          <div className="space-y-0.5">
            {definition.options?.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setPopoverOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between w-full rounded-md px-2 py-1.5 text-sm transition-colors',
                  value === opt.value
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {opt.label}
                {value === opt.value && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}

        {definition.type === 'multi-select' && (
          <div className="space-y-0.5">
            {definition.options?.map(opt => {
              const selected = Array.isArray(value) && value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(value) ? value : [];
                    const next = selected
                      ? current.filter(v => v !== opt.value)
                      : [...current, opt.value];
                    onChange(next);
                  }}
                  className={cn(
                    'flex items-center justify-between w-full rounded-md px-2 py-1.5 text-sm transition-colors',
                    selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  )}
                >
                  {opt.label}
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        )}

        {definition.type === 'boolean' && (
          <div className="space-y-0.5">
            {[
              { label: 'Yes', val: true },
              { label: 'No', val: false },
            ].map(opt => (
              <button
                key={String(opt.val)}
                type="button"
                onClick={() => {
                  onChange(opt.val);
                  setPopoverOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between w-full rounded-md px-2 py-1.5 text-sm transition-colors',
                  value === opt.val
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                {opt.label}
                {value === opt.val && <Check className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
