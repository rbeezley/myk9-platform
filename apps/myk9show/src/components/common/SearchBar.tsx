import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Compact size for inline/toolbar use */
  size?: 'default' | 'sm';
}

const sizeConfig = {
  default: {
    input: 'h-12 pl-11 pr-10 text-base rounded-xl',
    searchIcon: 'left-3.5 h-5 w-5',
    clearIcon: 'right-3 h-4 w-4',
  },
  sm: {
    input: 'h-8 pl-8 pr-8 text-sm rounded-lg',
    searchIcon: 'left-2.5 h-4 w-4',
    clearIcon: 'right-2 h-3.5 w-3.5',
  },
};

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  size = 'default',
}: SearchBarProps) {
  const styles = sizeConfig[size];

  return (
    <div className={cn('relative', className)}>
      <Search
        className={cn(
          'absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
          styles.searchIcon
        )}
      />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'w-full bg-card shadow-card focus:shadow-card-hover focus:ring-2 focus:ring-primary/20 outline-none transition-all',
          styles.input
        )}
      />
      {value && (
        <button
          type="button"
          className={cn(
            'absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors',
            styles.clearIcon
          )}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X className="h-full w-full" />
        </button>
      )}
    </div>
  );
}
