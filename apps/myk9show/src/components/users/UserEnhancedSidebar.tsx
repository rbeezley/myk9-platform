import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { UserRole } from '@/types/auth-types';
import { User } from '@/types/dog-types';
import { enhancedSearch, highlightMatches, SearchResult } from '@/lib/searchUtils';

export interface PeopleEnhancedSidebarProps {
  people: User[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  enableCollapse?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

// Filter chip component
const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-3 py-1 text-xs font-medium rounded-full transition-all duration-200",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:bg-muted/80"
    )}
  >
    {label}
  </button>
);

const PeopleEnhancedSidebar: React.FC<PeopleEnhancedSidebarProps> = ({
  people,
  selectedId,
  onSelect,
  enableCollapse = false,
  collapsed: collapsedProp,
  onToggleCollapse,
  className,
}) => {
  const [search, setSearch] = useState('');
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [judgeFilter, setJudgeFilter] = useState(false);
  const [hasDogsFilter, setHasDogsFilter] = useState(false);
  const collapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;

  // Pre-filter people based on active filters
  const filteredPeople = useMemo(() => {
    let result = people;

    if (judgeFilter) {
      result = result.filter(p =>
        p.roles?.includes(UserRole.JUDGE) ||
        (p.judgeQualifications && p.judgeQualifications.length > 0)
      );
    }

    if (hasDogsFilter) {
      result = result.filter(p => p.dogs && p.dogs.length > 0);
    }

    return result;
  }, [people, judgeFilter, hasDogsFilter]);

  // Enhanced search with fuzzy matching
  const searchResults = useMemo(() => {
    return enhancedSearch(
      filteredPeople,
      search,
      (person) => ({
        name: `${person.firstName} ${person.lastName}`,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email || '',
        phone: person.phone || '',
        address: [person.streetAddress, person.city, person.state, person.zipCode]
          .filter(Boolean)
          .join(' '),
        role: person.judgeQualifications?.length ? 'Judge' : 'Member'
      }),
      {
        threshold: 0.2,
        maxResults: 100,
        fuzzyEnabled: true
      }
    );
  }, [filteredPeople, search]);

  const hasActiveFilters = judgeFilter || hasDogsFilter;

  const handleCollapse = () => {
    if (onToggleCollapse) onToggleCollapse();
    else setInternalCollapsed(c => !c);
  };

  const clearSearch = () => {
    setSearch('');
  };

  const renderPersonItem = (result: SearchResult<User>) => {
    const { item: person, matches } = result;
    const isSelected = person.id === selectedId;
    const role = person.judgeQualifications?.length ? 'Judge' : 'Member';

    // Find matches for highlighting
    const nameMatches = matches.find(m => m.field === 'name' || m.field === 'firstName' || m.field === 'lastName');
    const emailMatches = matches.find(m => m.field === 'email');

    return (
      <div
        key={person.id}
        className={cn(
          "myk9-people-sidebar-item",
          isSelected && "selected"
        )}
        onClick={() => onSelect(person.id)}
      >
        <div className="myk9-people-sidebar-name">
          {nameMatches ? (
            highlightMatches(
              `${person.firstName} ${person.lastName}`,
              nameMatches.indices
            ).map((segment, index) => (
              segment.isHighlighted ? (
                <span key={index} className="bg-blue-200 dark:bg-blue-800 px-1 rounded">
                  {segment.text}
                </span>
              ) : (
                segment.text
              )
            ))
          ) : (
            `${person.firstName} ${person.lastName}`
          )}
        </div>
        <div className="myk9-people-sidebar-email">
          {emailMatches ? (
            highlightMatches(
              person.email || 'No email',
              emailMatches.indices
            ).map((segment, index) => (
              segment.isHighlighted ? (
                <span key={index} className="bg-blue-200 dark:bg-blue-800 px-1 rounded">
                  {segment.text}
                </span>
              ) : (
                segment.text
              )
            ))
          ) : (
            person.email || 'No email'
          )}
        </div>
        <div className="myk9-people-sidebar-role">
          {role}
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'border-r border-border transition-all duration-300 flex flex-col',
        'bg-card',
        collapsed ? 'w-20 min-w-[5rem]' : 'w-64',
        'mt-16',
        className
      )}
      style={{
        height: 'calc(100vh - 4rem)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border" style={{ flexShrink: 0, height: '56px' }}>
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate mr-2">People</h3>
            {searchResults.length !== people.length && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full">
                {searchResults.length}
              </span>
            )}
          </div>
        ) : (
          enableCollapse && (
            <button
              onClick={handleCollapse}
              className={cn(
                'p-2 rounded-md flex items-center justify-center w-full',
                'bg-primary/10 hover:bg-primary/20 text-primary transition-colors'
              )}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )
        )}
        {enableCollapse && !collapsed && (
          <button
            onClick={handleCollapse}
            className="p-2 rounded-md hover:bg-muted transition-colors"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Enhanced Search */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-border" style={{ flexShrink: 0 }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              className="w-full pl-8 pr-8 py-2 rounded-lg bg-muted text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              placeholder="Search by name, email, role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2 mt-2">
            <FilterChip
              label="Judges"
              active={judgeFilter}
              onClick={() => setJudgeFilter(f => !f)}
            />
            <FilterChip
              label="Has Dogs"
              active={hasDogsFilter}
              onClick={() => setHasDogsFilter(f => !f)}
            />
          </div>

          {(search || hasActiveFilters) && (
            <div className="mt-2 text-xs text-muted-foreground">
              {searchResults.length} of {people.length} people
              {search.length > 2 && searchResults.length === 0 && (
                <span className="text-orange-500"> - Try a different search</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchResults.length > 0 ? (
          <div className="p-2">
            {searchResults.map(renderPersonItem)}
          </div>
        ) : (search.length > 0 || hasActiveFilters) ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground mb-2">No people found</p>
            <p className="text-xs text-muted-foreground">
              {hasActiveFilters
                ? 'Try adjusting or clearing your filters'
                : 'Try searching by name, email, role, or location'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="text-4xl mb-4">👥</div>
            <p className="text-sm text-muted-foreground">No people available</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default PeopleEnhancedSidebar;