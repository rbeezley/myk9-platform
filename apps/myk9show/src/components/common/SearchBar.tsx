import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Accessible label for the search input */
  'aria-label'?: string;
  /** Compact size for inline/toolbar use */
  size?: 'default' | 'sm';
}

// `clearButton` is the hit area, `clearIcon` only the glyph inside it. They were
// previously the same class, which made the clear control as small as its 14px
// icon — far under the 44px touch floor these users need on a tablet.
const sizeConfig = {
  default: {
    input: 'h-12 pl-11 pr-12 text-base rounded-xl',
    searchIcon: 'left-3.5 h-5 w-5',
    clearButton: 'right-0 h-12 w-12',
    clearIcon: 'h-4 w-4',
  },
  sm: {
    // h-11 (44px), not h-8: this is the toolbar size used on every browse page,
    // and the guardrail in docs/INTENT.md is a 44px minimum target.
    input: 'h-11 pl-9 pr-11 text-sm rounded-lg',
    searchIcon: 'left-3 h-4 w-4',
    clearButton: 'right-0 h-11 w-11',
    clearIcon: 'h-4 w-4',
  },
};

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  'aria-label': ariaLabel,
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
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          'w-full bg-card shadow-card placeholder:text-muted-foreground focus:shadow-card-hover focus:ring-2 focus:ring-ring outline-none transition-all',
          styles.input
        )}
      />
      {value && (
        <button
          type="button"
          className={cn(
            'absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
            styles.clearButton
          )}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X className={styles.clearIcon} />
        </button>
      )}
    </div>
  );
}
