import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-12 w-full pl-11 pr-4 text-base bg-card shadow-card focus:shadow-card-hover focus:ring-2 focus:ring-primary/20 rounded-xl outline-none transition-all"
      />
    </div>
  );
}
