import { History, TrendingUp, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { KeyboardEvent } from 'react';

interface AdvancedSearchSuggestionsProps {
  suggestions: string[];
  searchHistory: string[];
  popularSearches: string[];
  onSuggestionSelect: (suggestion: string) => void;
  onClearSearchHistory: () => void;
}

function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, select: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    select();
  }
}

export function AdvancedSearchSuggestions({
  suggestions,
  searchHistory,
  popularSearches,
  onSuggestionSelect,
  onClearSearchHistory,
}: AdvancedSearchSuggestionsProps) {
  return (
    <div className="p-3" aria-label="Search suggestions">
      {suggestions.length > 0 && (
        <div className="mb-3" role="listbox" aria-label="Suggestions">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Suggestions</span>
          </div>
          <div className="space-y-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={false}
                className="w-full text-left px-2 py-1 text-sm hover:bg-muted/50 rounded transition-colors"
                onClick={() => onSuggestionSelect(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="mb-3" role="listbox" aria-label="Recent searches">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <History className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Recent Searches</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearSearchHistory}
              className="h-5 text-xs"
            >
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {searchHistory.slice(0, 5).map((term, index) => (
              <Badge
                key={index}
                variant="outline"
                role="option"
                aria-selected={false}
                tabIndex={0}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSuggestionSelect(term)}
                onKeyDown={event => handleOptionKeyDown(event, () => onSuggestionSelect(term))}
              >
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {popularSearches.length > 0 && (
        <div role="listbox" aria-label="Popular searches">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Popular</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {popularSearches.slice(0, 6).map((term, index) => (
              <Badge
                key={index}
                variant="secondary"
                role="option"
                aria-selected={false}
                tabIndex={0}
                className="cursor-pointer hover:bg-muted/70"
                onClick={() => onSuggestionSelect(term)}
                onKeyDown={event => handleOptionKeyDown(event, () => onSuggestionSelect(term))}
              >
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
