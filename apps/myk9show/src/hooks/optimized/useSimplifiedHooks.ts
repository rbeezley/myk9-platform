/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/rules-of-hooks */
/**
 * Simplified optimized hooks that consolidate common patterns
 * to reduce hook count and improve performance
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { logger } from '@/services/LoggingService';

/**
 * Simple consolidated state hook that replaces multiple useState calls
 */
export function useConsolidatedState<T extends Record<string, any>>(initialState: T) {
  const [state, setState] = useState<T>(initialState);

  const actions = useMemo(() => ({
    updateField: useCallback(<K extends keyof T>(field: K, value: T[K]) => {
      setState(prev => ({ ...prev, [field]: value }));
    }, []),

    updateFields: useCallback((updates: Partial<T>) => {
      setState(prev => ({ ...prev, ...updates }));
    }, []),

    resetState: useCallback(() => {
      setState(() => initialState);
    }, [])
  }), [initialState]);

  return [state, actions] as const;
}

/**
 * Optimized async operation hook that consolidates loading, error, and data states
 */
export function useAsyncOperation<T>() {
  const [asyncState, { updateFields }] = useConsolidatedState({
    data: null as T | null,
    loading: false,
    error: null as string | null
  });

  const execute = useCallback(async (asyncFn: () => Promise<T>) => {
    try {
      updateFields({ loading: true, error: null });
      const result = await asyncFn();
      updateFields({ data: result, loading: false });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      updateFields({ error: errorMessage, loading: false });
      throw error;
    }
  }, [updateFields]);

  const reset = useCallback(() => {
    updateFields({ data: null, loading: false, error: null });
  }, [updateFields]);

  return { ...asyncState, execute, reset };
}

/**
 * Optimized form state hook that reduces multiple useState calls
 */
export function useFormState<T extends Record<string, any>>(initialValues: T) {
  const [formState, { updateField, updateFields, resetState }] = useConsolidatedState({
    values: initialValues,
    errors: {} as Partial<Record<keyof T, string>>,
    touched: {} as Partial<Record<keyof T, boolean>>,
    isDirty: false
  });

  const setFieldValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    updateFields({
      values: { ...formState.values, [field]: value },
      touched: { ...formState.touched, [field]: true },
      isDirty: true
    });
  }, [formState.values, formState.touched, updateFields]);

  const setFieldError = useCallback(<K extends keyof T>(field: K, error: string | null) => {
    updateField('errors', { ...formState.errors, [field]: error });
  }, [formState.errors, updateField]);

  const resetForm = useCallback(() => {
    resetState();
  }, [resetState]);

  return {
    ...formState,
    setFieldValue,
    setFieldError,
    resetForm,
    isValid: Object.values(formState.errors).every(e => !e)
  };
}

/**
 * Memoized callbacks hook to prevent callback recreation
 */
export function useMemoizedCallbacks<T extends Record<string, (...args: any[]) => any>>(
  callbacks: T,
  dependencies: any[]
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => callbacks, [callbacks, ...dependencies]);
}

/**
 * Previous value hook for debugging re-renders
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const previous = ref.current;
  ref.current = value;
  return previous;
}

/**
 * Hook to track why a component re-rendered
 */
export function useWhyDidYouUpdate(name: string, props: Record<string, any>) {
  const previous = usePrevious(props);
  
  if (previous) {
    const changedProps = Object.entries(props).reduce((acc, [key, value]) => {
      if (previous[key] !== value) {
        acc[key] = {
          from: previous[key],
          to: value
        };
      }
      return acc;
    }, {} as Record<string, { from: any; to: any }>);
    
    if (Object.keys(changedProps).length > 0) {
      logger.debug('[useWhyDidYouUpdate]', 'hooks', { data: name, changedProps });
    }
  }
}

/**
 * Stable callback hook that doesn't change reference
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  
  return useMemo(() => {
    return ((...args) => callbackRef.current(...args)) as T;
  }, []);
}