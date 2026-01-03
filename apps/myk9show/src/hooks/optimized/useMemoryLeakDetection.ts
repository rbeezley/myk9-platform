/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 * Memory leak detection and monitoring system
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { LoggingService } from '@/services/LoggingService';

const logger = LoggingService.getInstance();

interface MemoryMetrics {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

interface ComponentMemoryInfo {
  name: string;
  mountTime: number;
  memoryAtMount: number;
  memoryAtUnmount?: number;
  memoryDiff?: number;
  leakSuspected?: boolean;
}

// Global memory tracking
const componentRegistry = new Map<string, ComponentMemoryInfo>();
let memoryHistory: MemoryMetrics[] = [];
let leakThreshold = 50 * 1024 * 1024; // 50MB threshold

/**
 * Get current memory usage
 */
function getMemoryMetrics(): MemoryMetrics | null {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      timestamp: Date.now()
    };
  }
  return null;
}

/**
 * Hook to track component memory usage and detect potential leaks
 */
export function useMemoryTracker(componentName: string) {
  const mountId = useRef(`${componentName}-${Date.now()}-${Math.random()}`);
  const mountMemory = useRef<number>(0);

  useEffect(() => {
    const metrics = getMemoryMetrics();
    if (metrics) {
      mountMemory.current = metrics.usedJSHeapSize;
      
      const componentInfo: ComponentMemoryInfo = {
        name: componentName,
        mountTime: Date.now(),
        memoryAtMount: metrics.usedJSHeapSize
      };
      
      componentRegistry.set(mountId.current, componentInfo);
      
      logger.debug('Component mounted', 'memoryTracker', {
        component: componentName,
        memoryAtMount: metrics.usedJSHeapSize,
        totalComponents: componentRegistry.size
      });
    }

    return () => {
      // Copy ref value to avoid stale reference
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentMountId = mountId.current;
      
      const metrics = getMemoryMetrics();
      if (metrics) {
        const componentInfo = componentRegistry.get(currentMountId);
        if (componentInfo) {
          const memoryDiff = metrics.usedJSHeapSize - componentInfo.memoryAtMount;
          const leakSuspected = memoryDiff > leakThreshold;
          
          componentInfo.memoryAtUnmount = metrics.usedJSHeapSize;
          componentInfo.memoryDiff = memoryDiff;
          componentInfo.leakSuspected = leakSuspected;
          
          if (leakSuspected) {
            logger.warn('Potential memory leak detected', 'memoryTracker', {
              component: componentName,
              memoryDiff,
              memoryAtMount: componentInfo.memoryAtMount,
              memoryAtUnmount: metrics.usedJSHeapSize,
              threshold: leakThreshold
            });
          }
          
          logger.debug('Component unmounted', 'memoryTracker', {
            component: componentName,
            memoryDiff,
            leakSuspected,
            totalComponents: componentRegistry.size - 1
          });
        }
        
        componentRegistry.delete(currentMountId);
      }
    };
  }, [componentName]);

  return {
    componentId: mountId.current,
    getMemoryInfo: () => componentRegistry.get(mountId.current)
  };
}

/**
 * Hook to monitor overall memory usage and trends
 */
export function useMemoryMonitor(options: {
  interval?: number;
  maxHistorySize?: number;
  alertThreshold?: number;
} = {}) {
  const {
    interval = 30000, // 30 seconds
    maxHistorySize = 100,
    alertThreshold = 100 * 1024 * 1024 // 100MB
  } = options;

  const [memoryStats, setMemoryStats] = useState<{
    current: MemoryMetrics | null;
    trend: 'increasing' | 'decreasing' | 'stable';
    alertLevel: 'normal' | 'warning' | 'critical';
  }>({
    current: null,
    trend: 'stable',
    alertLevel: 'normal'
  });

  useEffect(() => {
    const checkMemory = () => {
      const metrics = getMemoryMetrics();
      if (!metrics) return;

      // Add to history
      memoryHistory.push(metrics);
      if (memoryHistory.length > maxHistorySize) {
        memoryHistory = memoryHistory.slice(-maxHistorySize);
      }

      // Calculate trend
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (memoryHistory.length >= 5) {
        const recent = memoryHistory.slice(-5);
        const avgRecent = recent.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / recent.length;
        const older = memoryHistory.slice(-10, -5);
        if (older.length > 0) {
          const avgOlder = older.reduce((sum, m) => sum + m.usedJSHeapSize, 0) / older.length;
          const diff = avgRecent - avgOlder;
          if (diff > 5 * 1024 * 1024) trend = 'increasing'; // 5MB increase
          else if (diff < -5 * 1024 * 1024) trend = 'decreasing'; // 5MB decrease
        }
      }

      // Determine alert level
      let alertLevel: 'normal' | 'warning' | 'critical' = 'normal';
      if (metrics.usedJSHeapSize > alertThreshold) {
        alertLevel = 'critical';
      } else if (metrics.usedJSHeapSize > alertThreshold * 0.7) {
        alertLevel = 'warning';
      }

      // Log alerts
      if (alertLevel === 'critical') {
        logger.error('Critical memory usage detected', 'memoryMonitor', {
          usedMemory: metrics.usedJSHeapSize,
          threshold: alertThreshold,
          trend,
          activeComponents: componentRegistry.size
        });
      } else if (alertLevel === 'warning') {
        logger.warn('High memory usage detected', 'memoryMonitor', {
          usedMemory: metrics.usedJSHeapSize,
          threshold: alertThreshold,
          trend,
          activeComponents: componentRegistry.size
        });
      }

      setMemoryStats({
        current: metrics,
        trend,
        alertLevel
      });
    };

    checkMemory(); // Initial check
    const intervalId = setInterval(checkMemory, interval);

    return () => clearInterval(intervalId);
  }, [interval, maxHistorySize, alertThreshold]);

  const getMemoryReport = useCallback(() => {
    const suspectedLeaks = Array.from(componentRegistry.values())
      .filter(info => info.leakSuspected)
      .sort((a, b) => (b.memoryDiff || 0) - (a.memoryDiff || 0));

    const componentsByMemory = Array.from(componentRegistry.values())
      .filter(info => info.memoryDiff !== undefined)
      .sort((a, b) => (b.memoryDiff || 0) - (a.memoryDiff || 0))
      .slice(0, 10);

    return {
      memoryHistory: memoryHistory.slice(-20), // Last 20 measurements
      suspectedLeaks,
      topMemoryConsumers: componentsByMemory,
      activeComponents: componentRegistry.size,
      currentStats: memoryStats
    };
  }, [memoryStats]);

  const forceGarbageCollection = useCallback(() => {
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc();
      logger.info('Forced garbage collection', 'memoryMonitor');
    } else {
      logger.warn('Garbage collection not available', 'memoryMonitor');
    }
  }, []);

  return {
    memoryStats,
    getMemoryReport,
    forceGarbageCollection,
    setLeakThreshold: (threshold: number) => {
      leakThreshold = threshold;
    }
  };
}

/**
 * Hook to detect event listener leaks
 */
export function useEventListenerTracker() {
  const listeners = useRef(new Set<{ element: EventTarget; event: string; handler: Function }>());

  const addListener = useCallback((element: EventTarget, event: string, handler: Function, options?: boolean | AddEventListenerOptions) => {
    element.addEventListener(event, handler as EventListener, options);
    listeners.current.add({ element, event, handler });
  }, []);

  const removeListener = useCallback((element: EventTarget, event: string, handler: Function, options?: boolean | EventListenerOptions) => {
    element.removeEventListener(event, handler as EventListener, options);
    listeners.current.delete({ element, event, handler });
  }, []);

  useEffect(() => {
    return () => {
      // Copy ref value to avoid stale reference
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentListeners = listeners.current;
      
      // Cleanup all listeners on unmount
      currentListeners.forEach(({ element, event, handler }) => {
        try {
          element.removeEventListener(event, handler as EventListener);
        } catch (error) {
          logger.warn('Failed to remove event listener', 'eventListenerTracker', { event, error });
        }
      });
      
      if (currentListeners.size > 0) {
        logger.warn('Event listeners not properly removed', 'eventListenerTracker', {
          count: currentListeners.size
        });
      }
      
      currentListeners.clear();
    };
  }, []);

  return {
    addListener,
    removeListener,
    getActiveListeners: () => Array.from(listeners.current)
  };
}

/**
 * Hook to track setTimeout/setInterval leaks
 */
export function useTimerTracker() {
  const timers = useRef(new Set<number>());

  const setTimeout = useCallback((callback: Function, delay?: number) => {
    const id = window.setTimeout(callback as TimerHandler, delay);
    timers.current.add(id);
    return id;
  }, []);

  const setInterval = useCallback((callback: Function, delay?: number) => {
    const id = window.setInterval(callback as TimerHandler, delay);
    timers.current.add(id);
    return id;
  }, []);

  const clearTimeout = useCallback((id: number) => {
    window.clearTimeout(id);
    timers.current.delete(id);
  }, []);

  const clearInterval = useCallback((id: number) => {
    window.clearInterval(id);
    timers.current.delete(id);
  }, []);

  useEffect(() => {
    return () => {
      // Copy ref value to avoid stale reference
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const currentTimers = timers.current;
      
      // Cleanup all timers on unmount
      currentTimers.forEach(id => {
        window.clearTimeout(id);
        window.clearInterval(id);
      });
      
      if (currentTimers.size > 0) {
        logger.warn('Timers not properly cleared', 'timerTracker', {
          count: currentTimers.size
        });
      }
      
      currentTimers.clear();
    };
  }, []);

  return {
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    getActiveTimers: () => Array.from(timers.current)
  };
}