import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Dog } from '@/types/dog-types';
import { logger } from '@/services/LoggingService';
// import { User } from '@/types/user-types';

// Temporary interface until people types are available
interface User {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}
import { Show } from '@/types/show-types';

// Search result types
export interface SearchResult<T = unknown> {
  items: T[];
  totalCount: number;
  query: string;
  filters: Record<string, unknown>;
  timestamp: number;
}

export interface SearchOptions {
  query: string;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  context: 'dogs' | 'people' | 'shows' | 'general';
}

// Cache key generators
export const generateSearchCacheKey = (options: SearchOptions): string[] => {
  const { query, filters = {}, limit = 50, offset = 0, context } = options;
  return [
    'search',
    context,
    query.toLowerCase().trim(),
    JSON.stringify(filters),
    limit.toString(),
    offset.toString()
  ];
};

export const generateEntityCacheKey = (entityType: string, id?: string): string[] => {
  return id ? ['entity', entityType, id] : ['entities', entityType];
};

// Search functions that would normally make API calls
export const searchDogs = async (options: SearchOptions): Promise<SearchResult<Dog>> => {
  const { query, filters = {}, limit = 50, offset = 0 } = options;
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // In a real app, this would be an API call
  // For now, we'll use the store data
  const response = await fetch('/api/dogs/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters, limit, offset })
  });
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  return response.json();
};

export const searchPeople = async (options: SearchOptions): Promise<SearchResult<User>> => {
  const { query, filters = {}, limit = 50, offset = 0 } = options;
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const response = await fetch('/api/people/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters, limit, offset })
  });
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  return response.json();
};

export const searchShows = async (options: SearchOptions): Promise<SearchResult<Show>> => {
  const { query, filters = {}, limit = 50, offset = 0 } = options;
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const response = await fetch('/api/shows/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters, limit, offset })
  });
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  return response.json();
};

// Mock search functions for development (using store data)
export const mockSearchDogs = async (
  dogs: Dog[], 
  options: SearchOptions
): Promise<SearchResult<Dog>> => {
  const { query, filters = {}, limit = 50, offset = 0 } = options;
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 150));
  
  let filtered = [...dogs];
  
  // Apply search query
  if (query.trim()) {
    const searchTerm = query.toLowerCase();
    filtered = filtered.filter(dog => 
      dog.callName?.toLowerCase().includes(searchTerm) ||
      dog.name?.toLowerCase().includes(searchTerm) ||
      dog.registrations?.[0]?.breed?.toLowerCase().includes(searchTerm) ||
      dog.microchip?.toLowerCase().includes(searchTerm) ||
      dog.registrations?.some(reg => 
        reg.registeredName?.toLowerCase().includes(searchTerm) ||
        reg.registrationNumber?.toLowerCase().includes(searchTerm)
      )
    );
  }
  
  // Apply filters
  if (filters.breed) {
    filtered = filtered.filter(dog => dog.registrations?.[0]?.breed === filters.breed);
  }
  if (filters.gender) {
    filtered = filtered.filter(dog => dog.gender === filters.gender);
  }
  if (filters.ageGroup) {
    const now = Date.now();
    filtered = filtered.filter(dog => {
      if (!dog.dateOfBirth) return false;
      const ageInMonths = (now - new Date(dog.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 30);
      switch (filters.ageGroup) {
        case 'puppy': return ageInMonths < 18;
        case 'young': return ageInMonths >= 18 && ageInMonths < 60;
        case 'adult': return ageInMonths >= 60 && ageInMonths < 84;
        case 'senior': return ageInMonths >= 84;
        default: return true;
      }
    });
  }
  
  const totalCount = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  
  return {
    items,
    totalCount,
    query,
    filters,
    timestamp: Date.now()
  };
};

// React Query hooks for cached search
export interface UseSearchOptions extends SearchOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

export const useDogsSearch = (options: UseSearchOptions) => {
  const { enabled = true, staleTime = 5 * 60 * 1000, cacheTime = 10 * 60 * 1000, ...searchOptions } = options;
  
  return useQuery({
    queryKey: generateSearchCacheKey(searchOptions),
    queryFn: () => searchDogs(searchOptions),
    enabled: enabled && !!searchOptions.query.trim(),
    staleTime, // 5 minutes
    gcTime: cacheTime, // 10 minutes (renamed from cacheTime in newer versions)
    refetchOnWindowFocus: false,
  });
};

export const usePeopleSearch = (options: UseSearchOptions) => {
  const { enabled = true, staleTime = 5 * 60 * 1000, cacheTime = 10 * 60 * 1000, ...searchOptions } = options;
  
  return useQuery({
    queryKey: generateSearchCacheKey(searchOptions),
    queryFn: () => searchPeople(searchOptions),
    enabled: enabled && !!searchOptions.query.trim(),
    staleTime,
    gcTime: cacheTime,
    refetchOnWindowFocus: false,
  });
};

export const useShowsSearch = (options: UseSearchOptions) => {
  const { enabled = true, staleTime = 5 * 60 * 1000, cacheTime = 10 * 60 * 1000, ...searchOptions } = options;
  
  return useQuery({
    queryKey: generateSearchCacheKey(searchOptions),
    queryFn: () => searchShows(searchOptions),
    enabled: enabled && !!searchOptions.query.trim(),
    staleTime,
    gcTime: cacheTime,
    refetchOnWindowFocus: false,
  });
};

// Search cache utilities
export const useSearchCache = () => {
  const queryClient = useQueryClient();
  
  const prefetchSearch = async (options: SearchOptions) => {
    const cacheKey = generateSearchCacheKey(options);
    
    switch (options.context) {
      case 'dogs':
        await queryClient.prefetchQuery({
          queryKey: cacheKey,
          queryFn: () => searchDogs(options),
          staleTime: 5 * 60 * 1000,
        });
        break;
      case 'people':
        await queryClient.prefetchQuery({
          queryKey: cacheKey,
          queryFn: () => searchPeople(options),
          staleTime: 5 * 60 * 1000,
        });
        break;
      case 'shows':
        await queryClient.prefetchQuery({
          queryKey: cacheKey,
          queryFn: () => searchShows(options),
          staleTime: 5 * 60 * 1000,
        });
        break;
    }
  };
  
  const invalidateSearches = (context?: string) => {
    if (context) {
      queryClient.invalidateQueries({ queryKey: ['search', context] });
    } else {
      queryClient.invalidateQueries({ queryKey: ['search'] });
    }
  };
  
  const clearSearchCache = (context?: string) => {
    if (context) {
      queryClient.removeQueries({ queryKey: ['search', context] });
    } else {
      queryClient.removeQueries({ queryKey: ['search'] });
    }
  };
  
  const getCachedSearchResult = <T>(options: SearchOptions): SearchResult<T> | undefined => {
    const cacheKey = generateSearchCacheKey(options);
    return queryClient.getQueryData(cacheKey);
  };
  
  return {
    prefetchSearch,
    invalidateSearches,
    clearSearchCache,
    getCachedSearchResult
  };
};

// Search analytics and performance tracking
export interface SearchAnalytics {
  query: string;
  context: string;
  resultCount: number;
  responseTime: number;
  cacheHit: boolean;
  timestamp: number;
}

export const useSearchAnalytics = () => {
  const logSearch = useCallback((analytics: SearchAnalytics) => {
    // In a real app, this would send to analytics service
    // logger.debug('Search Analytics:', 'lib', { data: analytics }); // Disabled to reduce logging
    
    // Store in localStorage for debugging
    try {
      const existingLogs = JSON.parse(localStorage.getItem('searchAnalytics') || '[]');
      existingLogs.push(analytics);
      // Keep only last 100 searches
      const recentLogs = existingLogs.slice(-100);
      localStorage.setItem('searchAnalytics', JSON.stringify(recentLogs));
    } catch (error) {
      logger.warn('Failed to log search analytics:', 'lib', {}, error as Error);
    }
  }, []);
  
  const getSearchStats = () => {
    try {
      const logs: SearchAnalytics[] = JSON.parse(localStorage.getItem('searchAnalytics') || '[]');
      
      const totalSearches = logs.length;
      const cacheHitRate = logs.filter(log => log.cacheHit).length / totalSearches;
      const averageResponseTime = logs.reduce((sum, log) => sum + log.responseTime, 0) / totalSearches;
      const popularQueries = logs.reduce<Record<string, number>>((acc, log) => {
        acc[log.query] = (acc[log.query] || 0) + 1;
        return acc;
      }, {});
      
      return {
        totalSearches,
        cacheHitRate,
        averageResponseTime,
        popularQueries: Object.entries(popularQueries)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([query, count]) => ({ query, count }))
      };
    } catch (error) {
      logger.warn('Failed to get search stats:', 'lib', {}, error as Error);
      return null;
    }
  };
  
  return {
    logSearch,
    getSearchStats
  };
};

// Simple in-memory cache implementation
export interface SearchCacheConfig {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class SimpleSearchCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number;

  constructor(config: SearchCacheConfig = {}) {
    this.maxSize = config.maxSize ?? 100;
    this.defaultTtl = config.ttl ?? 5 * 60 * 1000; // 5 minutes
  }

  set(key: string, data: T, ttl?: number): void {
    // Remove expired entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
      
      // If still full, remove oldest entry
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Factory function to create a search cache instance
 */
export function createSearchCache<T = unknown>(config?: SearchCacheConfig): SimpleSearchCache<T> {
  return new SimpleSearchCache<T>(config);
}