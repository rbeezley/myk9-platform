import React, { useState, useEffect } from 'react';
import { Clock, X, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecentSearch } from '@/hooks/useRecentSearches';

interface RecentSearchesProps {
  recentSearches: RecentSearch[];
  onSearchSelect: (query: string) => void;
  onSearchRemove: (searchId: string) => void;
  onClearAll: () => void;
  showMetadata?: boolean;
  maxItems?: number;
  className?: string;
}

export const RecentSearches: React.FC<RecentSearchesProps> = ({
  recentSearches,
  onSearchSelect,
  onSearchRemove,
  onClearAll,
  showMetadata = true,
  maxItems = 5,
  className = ""
}) => {
  // Track current time for relative timestamps - hooks must be called before any early returns
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp: number) => {
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (recentSearches.length === 0) {
    return (
      <Card className={`border-dashed ${className}`}>
        <CardContent className="p-6 text-center">
          <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No recent searches</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your recent searches will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  const displaySearches = recentSearches.slice(0, maxItems);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Searches
          </CardTitle>
          {recentSearches.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {displaySearches.map((search) => (
          <div
            key={search.id}
            className="group flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
          >
            <button
              onClick={() => onSearchSelect(search.query)}
              className="flex-1 text-left text-sm hover:text-primary transition-colors"
            >
              <div className="flex items-center gap-2">
                <Search className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{search.query}</span>
                {showMetadata && search.metadata?.resultCount !== undefined && (
                  <Badge variant="secondary" className="text-xs">
                    {search.metadata.resultCount} results
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 ml-5">
                {formatTimestamp(search.timestamp)}
              </div>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSearchRemove(search.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        
        {recentSearches.length > maxItems && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            +{recentSearches.length - maxItems} more searches
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface SearchSuggestionsProps {
  suggestions: RecentSearch[];
  currentQuery: string;
  onSuggestionSelect: (query: string) => void;
  frequentSearches?: { query: string; count: number }[];
  className?: string;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  suggestions,
  currentQuery,
  onSuggestionSelect,
  frequentSearches = [],
  className = ""
}) => {
  if (suggestions.length === 0 && frequentSearches.length === 0) {
    return null;
  }

  return (
    <Card className={`absolute top-full left-0 right-0 mt-1 z-50 shadow-lg ${className}`}>
      <CardContent className="p-2">
        {/* Recent matching suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Recent
            </div>
            {suggestions.map((search) => (
              <button
                key={search.id}
                onClick={() => onSuggestionSelect(search.query)}
                className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <Search className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{search.query}</span>
                  {search.metadata?.resultCount !== undefined && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {search.metadata.resultCount}
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Frequent searches (when no current query) */}
        {!currentQuery && frequentSearches.length > 0 && (
          <div className="space-y-1 mt-2">
            {suggestions.length > 0 && <div className="border-t my-2" />}
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Popular
            </div>
            {frequentSearches.slice(0, 3).map((search, index) => (
              <button
                key={`frequent-${index}`}
                onClick={() => onSuggestionSelect(search.query)}
                className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{search.query}</span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {search.count}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};