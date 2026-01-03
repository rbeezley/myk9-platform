/* eslint-disable react-hooks/use-memo */
/**
 * Memo Utilities for Performance Optimization
 *
 * Provides React.memo wrappers and comparison functions optimized
 * for common patterns in the myK9Q app.
 */

import React, { memo, useMemo } from 'react';
import type { Entry } from '@/stores/entryStore';

/**
 * Shallow comparison for props (default React.memo behavior)
 */
export function shallowEqual(objA: unknown, objB: unknown): boolean {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  // Cast to Record for indexing after type narrowing
  const recordA = objA as Record<string, unknown>;
  const recordB = objB as Record<string, unknown>;

  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (
      !Object.prototype.hasOwnProperty.call(recordB, key) ||
      !Object.is(recordA[key], recordB[key])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Deep comparison for nested objects
 * Use sparingly - expensive operation
 */
export function deepEqual(objA: unknown, objB: unknown): boolean {
  if (Object.is(objA, objB)) {
    return true;
  }

  if (
    typeof objA !== 'object' ||
    objA === null ||
    typeof objB !== 'object' ||
    objB === null
  ) {
    return false;
  }

  // Cast to Record for indexing after type narrowing
  const recordA = objA as Record<string, unknown>;
  const recordB = objB as Record<string, unknown>;

  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(recordB, key) ||
      !deepEqual(recordA[key], recordB[key])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Compare Entry objects by ID only
 * Prevents re-renders when entry details change but ID is same
 */
export function entryIdEqual(
  prevProps: { entry: Entry },
  nextProps: { entry: Entry }
): boolean {
  return prevProps.entry.id === nextProps.entry.id;
}

/**
 * Compare Entry objects by scoring-relevant fields
 * Only re-render when scoring data changes
 */
export function entryScoringEqual(
  prevProps: { entry: Entry },
  nextProps: { entry: Entry }
): boolean {
  const prev = prevProps.entry;
  const next = nextProps.entry;

  return (
    prev.id === next.id &&
    prev.checkinStatus === next.checkinStatus &&
    prev.isScored === next.isScored &&
    prev.searchTime === next.searchTime &&
    prev.faultCount === next.faultCount &&
    prev.placement === next.placement &&
    prev.resultText === next.resultText
  );
}

/**
 * Memoize array transformations
 * Use for filtering, sorting, mapping operations
 */
export function useMemoizedArray<T, R>(
  array: T[],
  transform: (arr: T[]) => R[],
  deps: React.DependencyList = []
): R[] {
  return useMemo(() => {
    if (!array || array.length === 0) return [];
     
    return transform(array);
  }, [array, ...deps]);
}

/**
 * Memoize filtered arrays with stable reference
 */
export function useMemoizedFilter<T>(
  array: T[],
  predicate: (item: T) => boolean,
  deps: React.DependencyList = []
): T[] {
  return useMemo(() => {
    if (!array || array.length === 0) return [];
    return array.filter(predicate);
     
  }, [array, ...deps]);
}

/**
 * Memoize sorted arrays with stable reference
 */
export function useMemoizedSort<T>(
  array: T[],
  compareFn: (a: T, b: T) => number,
  deps: React.DependencyList = []
): T[] {
  return useMemo(() => {
    if (!array || array.length === 0) return [];
    return [...array].sort(compareFn);
     
  }, [array, ...deps]);
}

/**
 * Memoize object transformations
 */
export function useMemoizedObject<T extends Record<string, unknown>>(
  factory: () => T,
  deps: React.DependencyList
): T {
  return useMemo(factory, deps);
}

/**
 * Memoize callbacks with stable reference
 * Alternative to useCallback with better DX
 */
export function useMemoizedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: React.DependencyList
): T {
  return useMemo(() => callback, deps);
}

/**
 * Create a memoized component with custom comparison
 */
export function createMemoComponent<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean
): React.MemoExoticComponent<React.ComponentType<P>> {
  return memo(Component, propsAreEqual);
}

/**
 * Batch state updates to prevent cascading renders
 * Uses React 18's automatic batching
 */
export function batchUpdates(callback: () => void): void {
  // React 18 automatically batches all state updates
  // This is kept for semantic clarity and future compatibility
  callback();
}

/**
 * Check if two arrays have same items (order-independent)
 */
export function arrayHasSameItems<T>(arrA: T[], arrB: T[]): boolean {
  if (arrA.length !== arrB.length) return false;

  const setA = new Set(arrA);
  const setB = new Set(arrB);

  if (setA.size !== setB.size) return false;

  for (const item of setA) {
    if (!setB.has(item)) return false;
  }

  return true;
}

/**
 * Memoize expensive computations with cache
 */
export class MemoCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: K, factory: () => V): V {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const value = factory();

    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Create a memoized selector for Zustand stores
 */
export function createMemoSelector<T, R>(
  selector: (state: T) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is
): (state: T) => R {
  let lastState: T | undefined;
  let lastResult: R | undefined;

  return (state: T): R => {
    if (lastState === state && lastResult !== undefined) {
      return lastResult;
    }

    const result = selector(state);

    if (lastResult !== undefined && equalityFn(lastResult, result)) {
      return lastResult;
    }

    lastState = state;
    lastResult = result;
    return result;
  };
}
