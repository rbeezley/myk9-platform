/**
 * useLazyComponent - Hook for managing lazy component loading
 * 
 * Provides loading state management and error handling for dynamically
 * imported components
 */

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';

interface LazyComponentState<T> {
  component: T | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

type ComponentLoader<T> = () => Promise<{ default: T }>;

export function useLazyComponent<T>(
  loader: ComponentLoader<T>,
  dependencies: unknown[] = []
): LazyComponentState<T> {
  const [component, setComponent] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadComponent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const loadedModule = await loader();
      setComponent(loadedModule.default);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load component'));
      logger.error('Failed to load lazy component:', 'hooks', {}, err as Error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loader, ...dependencies]);

  const retry = useCallback(() => {
    loadComponent();
  }, [loadComponent]);

  useEffect(() => {
    loadComponent();
  }, [loadComponent]);

  return {
    component,
    loading,
    error,
    retry
  };
}

// Specialized hooks for common heavy components
export const useShowCalendar = () => 
  useLazyComponent(() => import('@/components/shows/ShowCalendar/ShowCalendar').then(m => ({ default: m.ShowCalendar })));

export const useAnalyticsDashboard = () => 
  useLazyComponent(() => import('@/components/analytics/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));

export const useRichTextEditor = () => 
  useLazyComponent(() => import('@/components/dogs/DogDetails/TrainingJournal/RichTextEditor').then(m => ({ default: m.RichTextEditor })));

export const usePrintManager = () => 
  useLazyComponent(() => import('@/components/reports/PrintManager').then(m => ({ default: m.PrintManager })));

// Hook for conditional loading based on feature flags or user preferences
export function useConditionalLazyComponent<T>(
  loader: ComponentLoader<T>,
  condition: boolean,
  dependencies: unknown[] = []
): LazyComponentState<T> {
  const [shouldLoad, setShouldLoad] = useState(condition);
  
  useEffect(() => {
    setShouldLoad(condition);
  }, [condition]);

  return useLazyComponent(
    loader, 
    shouldLoad ? dependencies : []
  );
}