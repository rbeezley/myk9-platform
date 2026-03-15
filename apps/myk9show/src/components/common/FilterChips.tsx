import { useState, useEffect, useRef } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterDefinition {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterChipsProps {
  filters: FilterDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string | null) => void;
  className?: string;
}

export function FilterChips({ filters, values, onChange, className }: FilterChipsProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openKey) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openKey]);

  return (
    <div ref={containerRef} className={cn('flex flex-wrap gap-2', className)}>
      {filters.map(filter => {
        const activeValue = values[filter.key];
        const activeOption = filter.options.find(o => o.value === activeValue);
        const isOpen = openKey === filter.key;

        return (
          <div key={filter.key} className="relative">
            <button
              className={cn(
                'h-12 rounded-full px-4 text-base inline-flex items-center gap-1.5 border transition-colors',
                activeValue
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent'
              )}
              onClick={() => setOpenKey(isOpen ? null : filter.key)}
            >
              {activeOption ? activeOption.label : filter.label}
              {activeValue ? (
                <X
                  className="h-4 w-4 ml-1"
                  onClick={e => {
                    e.stopPropagation();
                    onChange(filter.key, null);
                    setOpenKey(null);
                  }}
                />
              ) : (
                <ChevronDown className="h-4 w-4 ml-0.5" />
              )}
            </button>
            {isOpen && (
              <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-50 min-w-[160px] py-1">
                {filter.options.map(option => (
                  <button
                    key={option.value}
                    className={cn(
                      'w-full text-left px-4 py-3 text-base hover:bg-accent transition-colors',
                      activeValue === option.value && 'bg-accent font-medium'
                    )}
                    onClick={() => {
                      onChange(filter.key, option.value);
                      setOpenKey(null);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { FilterDefinition, FilterOption };
