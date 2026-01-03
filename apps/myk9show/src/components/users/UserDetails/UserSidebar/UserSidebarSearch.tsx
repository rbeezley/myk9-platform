import React from 'react';
import { Search, X, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useUserSidebarStore } from '@/store/userSidebarStore';

interface PeopleSidebarSearchProps {
  isCollapsed: boolean;
  toggleCollapsed?: () => void;
}

const PeopleSidebarSearch: React.FC<PeopleSidebarSearchProps> = ({
  isCollapsed,
  toggleCollapsed
}) => {
  const { searchTerm, setSearchTerm } = useUserSidebarStore();

  const handleClear = () => {
    setSearchTerm('');
  };

  // If sidebar is collapsed, clicking the search icon will expand it
  const handleSearchIconClick = () => {
    if (isCollapsed && toggleCollapsed) {
      toggleCollapsed();
    }
  };

  return (
    <div className={cn(
      "px-3 py-2 border-b border-border dark:border-border/40",
      isCollapsed ? "flex justify-center" : ""
    )}>
      {isCollapsed ? (
        <button
          onClick={handleSearchIconClick}
          className="p-2 rounded-md hover:bg-muted/50 transition-colors"
          aria-label="Expand sidebar to search"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search people..."
              value={""}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cn(
                "pl-9 pr-8 h-9 bg-[var(--dialog-input-bg)]",
                "focus-visible:ring-1 focus-visible:ring-ring"
              )}
            />
            {searchTerm && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
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
      )}
    </div>
  );
};

export default PeopleSidebarSearch;
