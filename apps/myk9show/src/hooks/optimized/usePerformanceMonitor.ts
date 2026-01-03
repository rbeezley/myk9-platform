/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Performance monitoring hooks for tracking hook usage and re-renders
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { LoggingService } from '@/services/LoggingService';

const logger = LoggingService.getInstance();

export interface RenderInfo {
  renderCount: number;
  lastRenderTime: number;
  totalRenderTime: number;
  averageRenderTime: number;
  changes: Array<{
    prop: string;
    oldValue: unknown;
    newValue: unknown;
    timestamp: number;
  }>;
}

export interface PerformanceMetrics {
  [componentName: string]: RenderInfo;
}

// Global performance metrics store
let globalMetrics: PerformanceMetrics = {};

/**
 * Hook to track component re-renders and identify performance bottlenecks
 */
export function useRenderTracker(componentName: string, props?: Record<string, unknown>) {
  const renderCount = useRef(0);
  const startTime = useRef(0);
  const prevProps = useRef(props);
  
  // Track render start
  startTime.current = performance.now();
  renderCount.current += 1;

  useEffect(() => {
    const renderTime = performance.now() - startTime.current;
    
    // Update global metrics
    if (!globalMetrics[componentName]) {
      globalMetrics[componentName] = {
        renderCount: 0,
        lastRenderTime: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        changes: []
      };
    }

    const metrics = globalMetrics[componentName];
    metrics.renderCount = renderCount.current;
    metrics.lastRenderTime = renderTime;
    metrics.totalRenderTime += renderTime;
    metrics.averageRenderTime = metrics.totalRenderTime / metrics.renderCount;

    // Track prop changes if props provided
    if (props && prevProps.current) {
      const changes = Object.keys(props).reduce((acc, key) => {
        const oldValue = prevProps.current?.[key];
        const newValue = props[key];
        
        if (oldValue !== newValue) {
          acc.push({
            prop: key,
            oldValue,
            newValue,
            timestamp: Date.now()
          });
        }
        return acc;
      }, [] as Array<{prop: string; oldValue: unknown; newValue: unknown; timestamp: number}>);

      if (changes.length > 0) {
        metrics.changes.push(...changes);
        // Keep only last 10 changes to prevent memory leaks
        if (metrics.changes.length > 10) {
          metrics.changes = metrics.changes.slice(-10);
        }
      }
    }

    prevProps.current = props;

    // Log performance warnings for excessive renders
    if (renderTime > 16) { // More than one frame (16ms)
      logger.warn('Slow render detected', 'performance', {
        component: componentName,
        renderTime,
        renderCount: renderCount.current
      });
    }

    if (renderCount.current > 100 && renderCount.current % 50 === 0) {
      logger.warn('Excessive renders detected', 'performance', {
        component: componentName,
        renderCount: renderCount.current,
        averageRenderTime: metrics.averageRenderTime
      });
    }
  });

  return {
    renderCount: renderCount.current,
    getMetrics: () => globalMetrics[componentName]
  };
}

/**
 * Hook to track hook dependencies and identify unnecessary re-executions
 */
export function useHookTracker<T extends ReadonlyArray<unknown>>(
  hookName: string,
  dependencies: T,
  callback?: () => void
) {
  const depChangeCount = useRef(0);
  const prevDeps = useRef<T>(dependencies);
  const execCount = useRef(0);

  useEffect(() => {
    execCount.current += 1;
    
    // Check which dependencies changed
    const changedDeps: Array<{index: number; oldValue: unknown; newValue: unknown}> = [];
    dependencies.forEach((dep, index) => {
      if (prevDeps.current[index] !== dep) {
        changedDeps.push({
          index,
          oldValue: prevDeps.current[index],
          newValue: dep
        });
      }
    });

    if (changedDeps.length > 0) {
      depChangeCount.current += 1;
      
      logger.debug('Hook dependencies changed', 'performance', {
        hookName,
        execCount: execCount.current,
        changedDeps,
        totalDeps: dependencies.length
      });
    }

    prevDeps.current = dependencies;
    callback?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookName, callback, ...dependencies]);

  return {
    execCount: execCount.current,
    depChangeCount: depChangeCount.current
  };
}

/**
 * Hook to measure and track custom performance metrics
 */
export function usePerformanceMeasure(measureName: string) {
  const startMark = useRef<string | null>(null);

  const start = useCallback(() => {
    startMark.current = `${measureName}-start-${Date.now()}`;
    performance.mark(startMark.current);
  }, [measureName]);

  const end = useCallback(() => {
    if (!startMark.current) return 0;
    
    const endMark = `${measureName}-end-${Date.now()}`;
    performance.mark(endMark);
    
    try {
      performance.measure(measureName, startMark.current, endMark);
      const entries = performance.getEntriesByName(measureName);
      const lastEntry = entries[entries.length - 1];
      
      if (lastEntry) {
        logger.debug('Performance measure', 'performance', {
          measureName,
          duration: lastEntry.duration,
          startTime: lastEntry.startTime
        });
        
        // Clean up marks and measures
        performance.clearMarks(startMark.current);
        performance.clearMarks(endMark);
        performance.clearMeasures(measureName);
        
        return lastEntry.duration;
      }
    } catch (error) {
      logger.error('Performance measure failed', 'performance', { measureName, error });
    }
    
    startMark.current = null;
    return 0;
  }, [measureName]);

  return { start, end };
}

/**
 * Hook to get performance insights and recommendations
 */
export function usePerformanceInsights() {
  const [insights, setInsights] = useState<{
    slowComponents: Array<{name: string; avgRenderTime: number; renderCount: number}>;
    excessiveRenders: Array<{name: string; renderCount: number}>;
    recommendations: string[];
  }>({
    slowComponents: [],
    excessiveRenders: [],
    recommendations: []
  });

  const generateInsights = useCallback(() => {
    const slowComponents = Object.entries(globalMetrics)
      .filter(([, metrics]) => metrics.averageRenderTime > 16)
      .map(([name, metrics]) => ({
        name,
        avgRenderTime: metrics.averageRenderTime,
        renderCount: metrics.renderCount
      }))
      .sort((a, b) => b.avgRenderTime - a.avgRenderTime)
      .slice(0, 10);

    const excessiveRenders = Object.entries(globalMetrics)
      .filter(([, metrics]) => metrics.renderCount > 50)
      .map(([name, metrics]) => ({
        name,
        renderCount: metrics.renderCount
      }))
      .sort((a, b) => b.renderCount - a.renderCount)
      .slice(0, 10);

    const recommendations: string[] = [];
    
    if (slowComponents.length > 0) {
      recommendations.push('Consider memoizing slow components with React.memo()');
      recommendations.push('Review expensive calculations and wrap with useMemo()');
    }
    
    if (excessiveRenders.length > 0) {
      recommendations.push('Check for unnecessary prop changes causing re-renders');
      recommendations.push('Consider consolidating related state updates');
      recommendations.push('Use useCallback for event handlers to prevent re-renders');
    }

    setInsights({
      slowComponents,
      excessiveRenders,
      recommendations
    });
  }, []);

  const clearMetrics = useCallback(() => {
    globalMetrics = {};
    setInsights({
      slowComponents: [],
      excessiveRenders: [],
      recommendations: []
    });
  }, []);

  const exportMetrics = useCallback(() => {
    return {
      timestamp: new Date().toISOString(),
      metrics: globalMetrics,
      insights
    };
  }, [insights]);

  return {
    insights,
    generateInsights,
    clearMetrics,
    exportMetrics,
    getAllMetrics: () => globalMetrics
  };
}

/**
 * Development-only hook for debugging performance issues
 */
export function usePerformanceDebugger(enabled: boolean = process.env.NODE_ENV === 'development') {
  useEffect(() => {
    if (!enabled) return;

    // Set up performance observer to catch long tasks
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const longTasks = list.getEntries().filter(entry => entry.duration > 50);
        
        if (longTasks.length > 0) {
          logger.warn('Long tasks detected', 'performance', {
            tasks: longTasks.map(task => ({
              duration: task.duration,
              startTime: task.startTime,
              name: task.name
            }))
          });
        }
      });

      try {
        observer.observe({ entryTypes: ['longtask', 'measure'] });
      } catch (error) {
        // longtask might not be supported in all browsers
        observer.observe({ entryTypes: ['measure'] });
      }

      return () => observer.disconnect();
    }
  }, [enabled]);

  // Performance monitoring commands for console
  useEffect(() => {
    if (!enabled) return;

    const commands = {
      getPerformanceMetrics: () => globalMetrics,
      clearPerformanceMetrics: () => { globalMetrics = {}; },
      logSlowComponents: () => {
        const slow = Object.entries(globalMetrics)
          .filter(([, metrics]) => metrics.averageRenderTime > 16)
          .sort(([, a], [, b]) => b.averageRenderTime - a.averageRenderTime);
        
        console.table(slow.map(([name, metrics]) => ({
          component: name,
          avgRenderTime: metrics.averageRenderTime.toFixed(2) + 'ms',
          renderCount: metrics.renderCount
        })));
      }
    };

    // Add to global scope for debugging
    Object.assign(window, { performanceDebug: commands });

    return () => {
      delete (window as any).performanceDebug;
    };
  }, [enabled]);
}