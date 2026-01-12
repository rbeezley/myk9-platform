import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Slider } from '@/components/ui/slider';
import { searchService, SearchQuery, SearchFilters, SearchResult } from '@/services/SearchService';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import {
  Search, 
  Filter,
  Calendar as CalendarIcon,
  X,
  TrendingUp,
  Sliders,
  History,
  Zap
} from 'lucide-react';

interface AdvancedSearchProps {
  entityType: string;
  placeholder?: string;
  onSearch: (query: SearchQuery) => Promise<SearchResult>;
  onResults?: (results: SearchResult) => void;
  filters?: {
    categories?: string[];
    statuses?: string[];
    roles?: string[];
    organizations?: string[];
    locations?: string[];
    showPriceFilter?: boolean;
    showDateFilter?: boolean;
    customFilters?: Array<{
      key: string;
      label: string;
      type: 'select' | 'multiselect' | 'range' | 'boolean';
      options?: string[];
    }>;
  };
  className?: string;
}

export const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  entityType,
  placeholder = "Search...",
  onSearch,
  onResults,
  filters = {},
  className = ""
}) => {
  const { user } = useAuthContext();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  
  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedOrganizations, setSelectedOrganizations] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [customFilterValues, setCustomFilterValues] = useState<Record<string, unknown>>({});

  const loadSearchData = useCallback(async () => {
    try {
      const history = await searchService.getSearchHistory(user?.id || '', 10);
      setSearchHistory(history.map(entry => entry.query.term).filter(Boolean));
      
      const popular = await searchService.getPopularSearches(entityType, 8);
      setPopularSearches(popular);
    } catch (error) {
      logger.error('Failed to load search data:', 'components', {}, error as Error);
    }
  }, [user?.id, entityType]);

  const getSuggestions = useCallback(async () => {
    try {
      const suggestions = await searchService.getSearchSuggestions(entityType, searchTerm, 8);
      setSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (error) {
      logger.error('Failed to get suggestions:', 'components', {}, error as Error);
    }
  }, [entityType, searchTerm]);

  // Load search history and popular searches
  useEffect(() => {
    loadSearchData();
  }, [entityType, loadSearchData]);

  // Get suggestions as user types
  useEffect(() => {
    if (searchTerm.length >= 2) {
      getSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [searchTerm, getSuggestions]);

  const buildSearchQuery = (): SearchQuery => {
    const searchFilters: SearchFilters = {
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      status: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      roles: selectedRoles.length > 0 ? selectedRoles : undefined,
      organizations: selectedOrganizations.length > 0 ? selectedOrganizations : undefined,
      locations: selectedLocations.length > 0 ? selectedLocations : undefined,
      dateRange: dateRange.start || dateRange.end ? {
        start: dateRange.start || new Date(0),
        end: dateRange.end || new Date()
      } : undefined,
      priceRange: filters.showPriceFilter && (priceRange[0] > 0 || priceRange[1] < 1000) ? {
        min: priceRange[0],
        max: priceRange[1]
      } : undefined,
      customFields: Object.keys(customFilterValues).length > 0 ? customFilterValues : undefined
    };

    return searchService.buildAdvancedQuery(searchTerm, searchFilters);
  };

  const handleSearch = async () => {
    if (isSearching) return;
    
    setIsSearching(true);
    setShowSuggestions(false);
    
    try {
      const query = buildSearchQuery();
      const results = await searchService.search(entityType, query, onSearch, user?.id);
      onResults?.(results);
    } catch (error) {
      logger.error('Search failed:', 'components', {}, error as Error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSearchTerm(suggestion);
    setShowSuggestions(false);
    searchInputRef.current?.focus();
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSelectedRoles([]);
    setSelectedOrganizations([]);
    setSelectedLocations([]);
    setDateRange({});
    setPriceRange([0, 1000]);
    setCustomFilterValues({});
  };

  const clearSearchHistory = async () => {
    try {
      await searchService.clearSearchHistory(user?.id || '');
      setSearchHistory([]);
    } catch (error) {
      logger.error('Failed to clear search history:', 'components', {}, error as Error);
    }
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (selectedCategories.length > 0) count++;
    if (selectedStatuses.length > 0) count++;
    if (selectedRoles.length > 0) count++;
    if (selectedOrganizations.length > 0) count++;
    if (selectedLocations.length > 0) count++;
    if (dateRange.start || dateRange.end) count++;
    if (priceRange[0] > 0 || priceRange[1] < 1000) count++;
    if (Object.keys(customFilterValues).length > 0) count++;
    return count;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            onFocus={() => setShowSuggestions(suggestions.length > 0)}
            className="pl-10 pr-24"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="h-7"
            >
              <Sliders className="h-3 w-3 mr-1" />
              Filters
              {getActiveFilterCount() > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 w-4 p-0 text-xs">
                  {getActiveFilterCount()}
                </Badge>
              )}
            </Button>
            <Button
              onClick={handleSearch}
              disabled={isSearching}
              size="sm"
              className="h-7"
            >
              {isSearching ? (
                <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <Search className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Search Suggestions */}
        {showSuggestions && (suggestions.length > 0 || searchHistory.length > 0 || popularSearches.length > 0) && (
          <Card className="absolute top-full left-0 right-0 z-50 mt-1 shadow-lg">
            <CardContent className="p-3">
              {suggestions.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Suggestions</span>
                  </div>
                  <div className="space-y-1">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-muted/50 rounded transition-colors"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchHistory.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <History className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Recent Searches</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSearchHistory}
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
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSuggestionClick(term)}
                      >
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {popularSearches.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Popular</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {popularSearches.slice(0, 6).map((term, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer hover:bg-muted/70"
                        onClick={() => handleSuggestionClick(term)}
                      >
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Advanced Filters
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Categories Filter */}
              {filters.categories && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Categories</Label>
                  <div className="space-y-1">
                    {filters.categories.map((category) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category-${category}`}
                          checked={selectedCategories.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategories([...selectedCategories, category]);
                            } else {
                              setSelectedCategories(selectedCategories.filter(c => c !== category));
                            }
                          }}
                        />
                        <Label htmlFor={`category-${category}`} className="text-sm">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Filter */}
              {filters.statuses && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select onValueChange={(value) => {
                    if (!selectedStatuses.includes(value)) {
                      setSelectedStatuses([...selectedStatuses, value]);
                    }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {filters.statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedStatuses.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedStatuses.map((status) => (
                        <Badge key={status} variant="secondary" className="text-xs">
                          {status}
                          <button
                            onClick={() => setSelectedStatuses(selectedStatuses.filter(s => s !== status))}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Date Range Filter */}
              {filters.showDateFilter && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date Range</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="h-3 w-3 mr-2" />
                          {dateRange.start ? dateRange.start.toLocaleDateString() : 'Start Date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.start}
                          onSelect={(date) => setDateRange({ ...dateRange, start: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="h-3 w-3 mr-2" />
                          {dateRange.end ? dateRange.end.toLocaleDateString() : 'End Date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.end}
                          onSelect={(date) => setDateRange({ ...dateRange, end: date })}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {/* Price Range Filter */}
              {filters.showPriceFilter && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Price Range: ${priceRange[0]} - ${priceRange[1]}
                  </Label>
                  <Slider
                    value={priceRange}
                    onValueChange={(value) => setPriceRange(value as [number, number])}
                    max={1000}
                    min={0}
                    step={10}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};