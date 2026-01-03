/**
 * Performance Monitoring Hooks
 * 
 * React hooks for Phase 6 performance monitoring and optimization
 * Provides easy-to-use interfaces for components to monitor and optimize performance
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { realtimePerformanceMonitor, RealtimePerformanceMetrics, PerformanceAlert } from '../services/performance/realtimePerformanceMonitor';
import { syncPerformanceOptimizer, SyncPerformanceMetrics, SyncPerformanceAlert } from '../services/performance/syncPerformanceOptimizer';
import { uiPerformanceManager, UIPerformanceMetrics, UIPerformanceAlert } from '../services/performance/uiPerformanceManager';
import { eventEmitter } from '../services/sync/eventEmitter';
import { SyncOperation } from '../types/performance-types';

/**
 * Hook for monitoring real-time performance
 */
export function useRealtimePerformance() {
  const [metrics, setMetrics] = useState<RealtimePerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(realtimePerformanceMonitor.getMetrics());
      setAlerts(realtimePerformanceMonitor.getAlerts());
    };

    // Initial load
    updateMetrics();

    // Listen for performance updates
    eventEmitter.on('realtime:performance-alert', updateMetrics);
    eventEmitter.on('realtime:config-updated', updateMetrics);
    eventEmitter.on('realtime:performance-reset', updateMetrics);

    // Update metrics periodically
    const interval = setInterval(updateMetrics, 2000);

    return () => {
      eventEmitter.off('realtime:performance-alert', updateMetrics);
      eventEmitter.off('realtime:config-updated', updateMetrics);
      eventEmitter.off('realtime:performance-reset', updateMetrics);
      clearInterval(interval);
    };
  }, []);

  const startMonitoring = useCallback(() => {
    realtimePerformanceMonitor.startMonitoring();
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    realtimePerformanceMonitor.stopMonitoring();
    setIsMonitoring(false);
  }, []);

  const forceOptimization = useCallback(() => {
    realtimePerformanceMonitor.forceOptimization();
  }, []);

  const updateConfig = useCallback((config: Record<string, unknown>) => {
    realtimePerformanceMonitor.updateConfig(config);
  }, []);

  const getPerformanceSummary = useCallback(() => {
    return realtimePerformanceMonitor.getPerformanceSummary();
  }, []);

  return {
    metrics,
    alerts,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    forceOptimization,
    updateConfig,
    getPerformanceSummary
  };
}

/**
 * Hook for monitoring sync performance
 */
export function useSyncPerformance() {
  const [metrics, setMetrics] = useState<SyncPerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<SyncPerformanceAlert[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(syncPerformanceOptimizer.getMetrics());
      setAlerts(syncPerformanceOptimizer.getAlerts());
    };

    // Initial load
    updateMetrics();

    // Listen for sync performance updates
    eventEmitter.on('sync:performance-alert', updateMetrics);
    eventEmitter.on('sync:strategy-updated', updateMetrics);

    // Update metrics periodically
    const interval = setInterval(updateMetrics, 3000);

    return () => {
      eventEmitter.off('sync:performance-alert', updateMetrics);
      eventEmitter.off('sync:strategy-updated', updateMetrics);
      clearInterval(interval);
    };
  }, []);

  const startOptimization = useCallback(() => {
    syncPerformanceOptimizer.startOptimization();
    setIsOptimizing(true);
  }, []);

  const stopOptimization = useCallback(() => {
    syncPerformanceOptimizer.stopOptimization();
    setIsOptimizing(false);
  }, []);

  const optimizeSyncQueue = useCallback(async (operations: unknown[]) => {
    // Type guard to ensure operations are SyncOperation[]
    const validatedOperations = operations.filter((op): op is SyncOperation => {
      return typeof op === 'object' && op !== null &&
        'id' in op && 'entityType' in op && 'entityId' in op && 'action' in op && 'priority' in op;
    }) as SyncOperation[];
    return await syncPerformanceOptimizer.optimizeSyncQueue(validatedOperations);
  }, []);

  const optimizeDeltaSync = useCallback(async (entityType: string, data: Record<string, unknown>[]) => {
    return await syncPerformanceOptimizer.optimizeDeltaSync(entityType, data);
  }, []);

  const predictConflicts = useCallback((operations: unknown[]) => {
    // Type guard to ensure operations are SyncOperation[]
    const validatedOperations = operations.filter((op): op is SyncOperation => {
      return typeof op === 'object' && op !== null &&
        'id' in op && 'entityType' in op && 'entityId' in op && 'action' in op && 'priority' in op;
    }) as SyncOperation[];
    return syncPerformanceOptimizer.predictConflicts(validatedOperations);
  }, []);

  const updateStrategy = useCallback((strategy: Record<string, unknown>) => {
    syncPerformanceOptimizer.updateStrategy(strategy);
  }, []);

  const getPerformanceSummary = useCallback(() => {
    return syncPerformanceOptimizer.getPerformanceSummary();
  }, []);

  return {
    metrics,
    alerts,
    isOptimizing,
    startOptimization,
    stopOptimization,
    optimizeSyncQueue,
    optimizeDeltaSync,
    predictConflicts,
    updateStrategy,
    getPerformanceSummary
  };
}

/**
 * Hook for monitoring UI performance
 */
export function useUIPerformance() {
  const [metrics, setMetrics] = useState<UIPerformanceMetrics | null>(null);
  const [alerts, setAlerts] = useState<UIPerformanceAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(uiPerformanceManager.getMetrics());
      setAlerts(uiPerformanceManager.getAlerts());
    };

    // Initial load
    updateMetrics();

    // Listen for UI performance updates
    eventEmitter.on('ui:performance-alert', updateMetrics);
    eventEmitter.on('ui:optimization-updated', updateMetrics);
    eventEmitter.on('ui:memory-optimized', updateMetrics);

    // Update metrics periodically
    const interval = setInterval(updateMetrics, 1000);

    return () => {
      eventEmitter.off('ui:performance-alert', updateMetrics);
      eventEmitter.off('ui:optimization-updated', updateMetrics);
      eventEmitter.off('ui:memory-optimized', updateMetrics);
      clearInterval(interval);
    };
  }, []);

  const startMonitoring = useCallback(() => {
    uiPerformanceManager.startMonitoring();
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    uiPerformanceManager.stopMonitoring();
    setIsMonitoring(false);
  }, []);

  const optimizeComponentRendering = useCallback((componentName: string, props: Record<string, unknown>, prevProps?: Record<string, unknown>) => {
    return uiPerformanceManager.optimizeComponentRendering(componentName, props, prevProps);
  }, []);

  const optimizeListRendering = useCallback((listName: string, items: Record<string, unknown>[], viewportHeight: number, itemHeight: number) => {
    return uiPerformanceManager.optimizeListRendering(listName, items, viewportHeight, itemHeight);
  }, []);

  const batchRealtimeUpdate = useCallback((updateFn: () => void) => {
    uiPerformanceManager.batchRealtimeUpdate(updateFn);
  }, []);

  const optimizeMemoryUsage = useCallback(() => {
    uiPerformanceManager.optimizeMemoryUsage();
  }, []);

  const updateOptimization = useCallback((optimization: Record<string, unknown>) => {
    uiPerformanceManager.updateOptimization(optimization);
  }, []);

  const forceOptimization = useCallback(() => {
    uiPerformanceManager.forceOptimization();
  }, []);

  const getPerformanceSummary = useCallback(() => {
    return uiPerformanceManager.getPerformanceSummary();
  }, []);

  return {
    metrics,
    alerts,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    optimizeComponentRendering,
    optimizeListRendering,
    batchRealtimeUpdate,
    optimizeMemoryUsage,
    updateOptimization,
    forceOptimization,
    getPerformanceSummary
  };
}

/**
 * Hook for component-specific performance optimization
 */
export function useComponentPerformance(componentName: string) {
  const renderCountRef = useRef(0);
  const lastRenderTimeRef = useRef(0);
  const [renderStats, setRenderStats] = useState({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0
  });

  const trackRender = useCallback(() => {
    const startTime = performance.now();
    renderCountRef.current++;

    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      lastRenderTimeRef.current = renderTime;
      
      setRenderStats(prev => ({
        renderCount: renderCountRef.current,
        averageRenderTime: (prev.averageRenderTime * (prev.renderCount - 1) + renderTime) / prev.renderCount,
        lastRenderTime: renderTime
      }));

      // Emit render event for global monitoring
      eventEmitter.emit('react:component-rendered', {
        componentName,
        duration: renderTime,
        renderCount: renderCountRef.current
      });
    };
  }, [componentName]);

  const shouldMemoize = useCallback((props: Record<string, unknown>, prevProps: Record<string, unknown>) => {
    return uiPerformanceManager.optimizeComponentRendering(componentName, props, prevProps);
  }, [componentName]);

  return {
    renderStats,
    trackRender,
    shouldMemoize
  };
}

/**
 * Hook for list virtualization
 */
export function useVirtualizedList(listName: string, items: Record<string, unknown>[], itemHeight: number = 60) {
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizedData = useMemo(() => {
    return uiPerformanceManager.optimizeListRendering(listName, items, viewportHeight, itemHeight);
  }, [listName, items, viewportHeight, itemHeight]);

  useEffect(() => {
    const updateViewportHeight = () => {
      if (containerRef.current) {
        setViewportHeight(containerRef.current.clientHeight);
      }
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

  return {
    containerRef,
    virtualizedData,
    isVirtualized: virtualizedData.visibleItems.length < items.length
  };
}

/**
 * Hook for batching real-time updates
 */
export function useBatchedUpdates() {
  const batchUpdate = useCallback((updateFn: () => void) => {
    uiPerformanceManager.batchRealtimeUpdate(updateFn);
  }, []);

  const batchMultipleUpdates = useCallback((updateFns: (() => void)[]) => {
    updateFns.forEach(updateFn => {
      uiPerformanceManager.batchRealtimeUpdate(updateFn);
    });
  }, []);

  return {
    batchUpdate,
    batchMultipleUpdates
  };
}

/**
 * Hook for performance-aware state updates
 */
export function usePerformantState<T>(initialValue: T, updateThreshold: number = 16) {
  const [state, setState] = useState<T>(initialValue);
  const lastUpdateRef = useRef(0);
  const pendingUpdateRef = useRef<T | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performantSetState = useCallback((newValue: T | ((prev: T) => T)) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    const finalValue = typeof newValue === 'function' 
      ? (newValue as (prev: T) => T)(pendingUpdateRef.current || state)
      : newValue;

    pendingUpdateRef.current = finalValue;

    if (timeSinceLastUpdate >= updateThreshold) {
      // Update immediately
      setState(finalValue);
      lastUpdateRef.current = now;
      pendingUpdateRef.current = null;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } else {
      // Schedule update
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        if (pendingUpdateRef.current !== null) {
          setState(pendingUpdateRef.current);
          lastUpdateRef.current = Date.now();
          pendingUpdateRef.current = null;
        }
        timeoutRef.current = null;
      }, updateThreshold - timeSinceLastUpdate);
    }
  }, [state, updateThreshold]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [state, performantSetState] as const;
}

/**
 * Hook for monitoring interaction performance
 */
export function useInteractionPerformance() {
  const measureInteraction = useCallback((type: string, interactionFn: () => void) => {
    const startTime = performance.now();
    
    try {
      interactionFn();
    } finally {
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      eventEmitter.emit('ui:interaction', {
        type,
        latency,
        timestamp: Date.now()
      });
    }
  }, []);

  const measureAsyncInteraction = useCallback(async (type: string, interactionFn: () => Promise<void>) => {
    const startTime = performance.now();
    
    try {
      await interactionFn();
    } finally {
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      eventEmitter.emit('ui:interaction', {
        type,
        latency,
        timestamp: Date.now()
      });
    }
  }, []);

  return {
    measureInteraction,
    measureAsyncInteraction
  };
}

/**
 * Hook for comprehensive performance monitoring
 */
export function usePerformanceOverview() {
  const realtimePerf = useRealtimePerformance();
  const syncPerf = useSyncPerformance();
  const uiPerf = useUIPerformance();

  const overallStatus = useMemo(() => {
    const summaries = [
      realtimePerf.getPerformanceSummary(),
      syncPerf.getPerformanceSummary(),
      uiPerf.getPerformanceSummary()
    ];

    const overallScore = summaries.reduce((sum, summary) => {
      // Handle different summary interface types
      const score = 'overallScore' in summary ? summary.overallScore : summary.score;
      return sum + score;
    }, 0) / summaries.length;
    
    let status: 'excellent' | 'good' | 'needs-optimization' | 'poor';
    if (overallScore >= 0.9) status = 'excellent';
    else if (overallScore >= 0.7) status = 'good';
    else if (overallScore >= 0.5) status = 'needs-optimization';
    else status = 'poor';

    return {
      overallScore,
      status,
      realtime: summaries[0],
      sync: summaries[1],
      ui: summaries[2]
    };
  }, [realtimePerf, syncPerf, uiPerf]);

  const startAllMonitoring = useCallback(() => {
    realtimePerf.startMonitoring();
    syncPerf.startOptimization();
    uiPerf.startMonitoring();
  }, [realtimePerf, syncPerf, uiPerf]);

  const stopAllMonitoring = useCallback(() => {
    realtimePerf.stopMonitoring();
    syncPerf.stopOptimization();
    uiPerf.stopMonitoring();
  }, [realtimePerf, syncPerf, uiPerf]);

  const forceAllOptimizations = useCallback(() => {
    realtimePerf.forceOptimization();
    uiPerf.forceOptimization();
  }, [realtimePerf, uiPerf]);

  const getAllAlerts = useCallback(() => {
    return [
      ...realtimePerf.alerts.map(alert => ({ ...alert, category: 'realtime' as const })),
      ...syncPerf.alerts.map(alert => ({ ...alert, category: 'sync' as const })),
      ...uiPerf.alerts.map(alert => ({ ...alert, category: 'ui' as const }))
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [realtimePerf.alerts, syncPerf.alerts, uiPerf.alerts]);

  return {
    overallStatus,
    realtimePerf,
    syncPerf,
    uiPerf,
    startAllMonitoring,
    stopAllMonitoring,
    forceAllOptimizations,
    getAllAlerts
  };
}

/**
 * Hook for automatic performance optimization
 */
export function useAutoPerformanceOptimization(enabled: boolean = true) {
  const { forceAllOptimizations } = usePerformanceOverview();
  
  useEffect(() => {
    if (!enabled) return;

    // Auto-optimize every 5 minutes
    const interval = setInterval(() => {
      forceAllOptimizations();
    }, 300000);

    // Auto-optimize on page visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        forceAllOptimizations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, forceAllOptimizations]);

  return {
    forceOptimization: forceAllOptimizations
  };
}