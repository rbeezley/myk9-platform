/* eslint-disable react-hooks/use-memo, react-hooks/purity */
/**
 * Performance Hooks
 *
 * React hooks for device-aware performance optimization.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  detectDeviceCapabilities,
  getPerformanceSettings,
  setPerformanceOverrides,
  applyDeviceClasses,
  type DeviceCapabilities,
  type PerformanceSettings,
} from '@/utils/deviceDetection';
import { scheduleIdleWork, runWhenIdle } from '@/utils/idleWork';
import { logger } from '@/utils/logger';

/**
 * Hook to get device capabilities
 */
export function useDeviceCapabilities(): DeviceCapabilities | null {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);

  useEffect(() => {
    detectDeviceCapabilities().then(setCapabilities);
  }, []);

  return capabilities;
}

/**
 * Hook to get performance settings
 */
export function usePerformanceSettings(): PerformanceSettings | null {
  const [settings, setSettings] = useState<PerformanceSettings | null>(null);

  useEffect(() => {
    getPerformanceSettings().then(setSettings);
  }, []);

  return settings;
}

/**
 * Hook to check if animations should be enabled
 */
export function useShouldAnimate(): boolean {
  const settings = usePerformanceSettings();
  return settings?.animations ?? true;
}

/**
 * Hook to check if should use virtual scrolling
 */
export function useShouldVirtualize(itemCount: number): boolean {
  const settings = usePerformanceSettings();

  return useMemo(() => {
    if (!settings) return false;
    return itemCount >= settings.virtualScrollThreshold;
  }, [settings, itemCount]);
}

/**
 * Hook to get device tier
 */
export function useDeviceTier(): 'low' | 'medium' | 'high' | null {
  const capabilities = useDeviceCapabilities();
  return capabilities?.tier ?? null;
}

/**
 * Hook to conditionally render based on device tier
 */
export function useDeviceFeature(
  feature: 'blur' | 'shadow' | 'animation' | 'prefetch'
): boolean {
  const settings = usePerformanceSettings();

  return useMemo(() => {
    if (!settings) return true;

    switch (feature) {
      case 'blur':
        return settings.blurEffects;
      case 'shadow':
        return settings.shadows;
      case 'animation':
        return settings.animations;
      case 'prefetch':
        return settings.prefetchLevel > 0.5;
      default:
        return true;
    }
  }, [settings, feature]);
}

/**
 * Hook to schedule work during idle time
 */
export function useIdleCallback(
  callback: () => void | Promise<void>,
  deps: React.DependencyList = [],
  priority: 'high' | 'medium' | 'low' = 'medium'
): void {
  useEffect(() => {
    scheduleIdleWork(callback, { priority });

    return () => {
      // Cleanup handled by idleWork module
    };
  }, deps);
}

/**
 * Hook to run expensive computation during idle time
 */
export function useIdleComputation<T>(
  computation: () => T,
  deps: React.DependencyList = [],
  priority: 'high' | 'medium' | 'low' = 'medium'
): T | null {
  const [result, setResult] = useState<T | null>(null);

  useEffect(() => {
    runWhenIdle(computation, { priority })
      .then(setResult)
      .catch(console.error);
  }, deps);

  return result;
}

/**
 * Hook for adaptive debounce based on device tier
 */
export function useAdaptiveDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: React.DependencyList = []
): T {
  const settings = usePerformanceSettings();

  return useCallback(
    (...args: Parameters<T>) => {
      const debounceTime = settings?.debounceTime ?? 150;
      const timeoutId = setTimeout(() => {
        callback(...args);
      }, debounceTime);

      return () => clearTimeout(timeoutId);
     
    },
    [settings, ...deps]
  ) as T;
}

/**
 * Hook for adaptive throttle based on device tier
 */
export function useAdaptiveThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  deps: React.DependencyList = []
): T {
  const settings = usePerformanceSettings();
  const lastRun = useMemo(() => ({ value: 0 }), []);

  return useCallback(
    (...args: Parameters<T>) => {
      const throttleTime = settings?.throttleTime ?? 16;
      const now = Date.now();

      if (now - lastRun.value >= throttleTime) {
        lastRun.value = now;
        callback(...args);
      }
     
    },
    [settings, ...deps]
  ) as T;
}

/**
 * Hook to apply device classes to document
 */
export function useDeviceClasses(): void {
  useEffect(() => {
    applyDeviceClasses();
  }, []);
}

/**
 * Hook to override performance settings
 */
export function usePerformanceOverride() {
  return useCallback((overrides: Partial<PerformanceSettings>) => {
    setPerformanceOverrides(overrides);
    // Force re-render by updating settings
    getPerformanceSettings().then(() => {
      window.location.reload(); // Reload to apply new settings
    });
  }, []);
}

/**
 * Hook to measure component render time
 */
   
export function useRenderTime(componentName: string): void {
  const renderStart = useMemo(() => performance.now(), []);

  useEffect(() => {
    const renderEnd = performance.now();
    const duration = renderEnd - renderStart;

    if (duration > 16) {
      // Slower than 60fps
      logger.warn(
        `[Performance] ${componentName} took ${duration.toFixed(2)}ms to render (>16ms)`
      );
    }
  });
}

/**
 * Hook for intersection observer (lazy loading, prefetching)
 */
export function useIntersectionObserver(
  callback: (entry: IntersectionObserverEntry) => void,
  options: IntersectionObserverInit = {}
): (element: HTMLElement | null) => void {
  const observerRef = useMemo(
    () =>
      new IntersectionObserver((entries) => {
        entries.forEach(callback);
      }, options),
    [callback, options]
  );

  useEffect(() => {
    return () => observerRef.disconnect();
  }, [observerRef]);

  return useCallback(
    (element: HTMLElement | null) => {
      if (element) {
        observerRef.observe(element);
      }
    },
    [observerRef]
  );
}

/**
 * Hook for adaptive image quality
 */
export function useAdaptiveImageQuality(): number {
  const settings = usePerformanceSettings();
  return settings?.imageQuality ?? 1;
}

/**
 * Hook to check if device is low-end
 */
export function useIsLowEndDevice(): boolean {
  const tier = useDeviceTier();
  return tier === 'low';
}

/**
 * Hook to check if device is high-end
 */
export function useIsHighEndDevice(): boolean {
  const tier = useDeviceTier();
  return tier === 'high';
}

/**
 * Hook for battery-aware features
 */
export function useIsBatterySaving(): boolean {
  const capabilities = useDeviceCapabilities();
  return capabilities?.batterySaving ?? false;
}

/**
 * Hook to conditionally enable features based on network
 */
export function useNetworkSpeed(): 'slow' | 'medium' | 'fast' | null {
  const capabilities = useDeviceCapabilities();
  return capabilities?.connection ?? null;
}

/**
 * Hook for adaptive concurrent requests
 */
export function useMaxConcurrentRequests(): number {
  const settings = usePerformanceSettings();
  return settings?.maxConcurrentRequests ?? 6;
}
