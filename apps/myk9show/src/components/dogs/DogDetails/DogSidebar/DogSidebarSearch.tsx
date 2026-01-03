import React, { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, ChevronLeft } from 'lucide-react';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { cn } from '@/lib/utils';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';

interface DogSidebarSearchProps {
  isCollapsed: boolean;
  toggleCollapsed?: () => void;
}

const DogSidebarSearch: React.FC<DogSidebarSearchProps> = ({ isCollapsed, toggleCollapsed: propToggleCollapsed }) => {
  const { searchTerm, setSearchTerm } = useDogSidebarStore();
  
  // Only use the hook if no prop is provided
  const { toggleCollapsed: hookToggleCollapsed } = useResizableSidebar({
    initialWidth: 280,
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'dogSidebarWidth'
  });
  
  // Use the prop if provided, otherwise use the hook
  const toggleCollapsed = propToggleCollapsed || hookToggleCollapsed;
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  // Debounce search term updates
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(localSearchTerm);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [localSearchTerm, setSearchTerm]);

  // Update local state when store changes (e.g., from external reset)
  useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  const handleClear = useCallback(() => {
    setLocalSearchTerm('');
    setSearchTerm('');
  }, [setSearchTerm]);

  // When collapsed, only show search icon
  if (isCollapsed) {
    return (
      <div className="flex justify-center py-3">
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-md text-muted-foreground hover:bg-muted/80 transition-colors"
          aria-label="Search"
          title="Expand to search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 mt-2 relative">
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search dogs..."
            value={""}
            onChange={(e) => setLocalSearchTerm(e.target.value)}
            className={cn(
              "pl-9 pr-8 h-9 bg-[var(--dialog-input-bg)]",
              "border-muted-foreground/20 focus-visible:ring-primary/20"
            )}
          />
          {localSearchTerm && (
            <button
              onClick={handleClear}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          className="flex-shrink-0 p-1.5 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ml-2"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default DogSidebarSearch;
