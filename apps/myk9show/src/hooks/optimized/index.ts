/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable react-hooks/rules-of-hooks */
/**
 * Optimized Hooks Library
 * 
 * This library provides optimized versions of common React hook patterns
 * to improve performance and reduce memory usage.
 */

// Core optimized hooks
export {
  useConsolidatedState,
  useAsyncOperation,
  useFormState,
  useMemoizedCallbacks,
  usePrevious,
  useWhyDidYouUpdate,
  useStableCallback
} from './useSimplifiedHooks';

// Consolidated table management
export {
  useConsolidatedTable,
  useConsolidatedModals
} from './useConsolidatedHooks';

// Memory leak detection
export {
  useMemoryTracker,
  useMemoryMonitor,
  useEventListenerTracker,
  useTimerTracker
} from './useMemoryLeakDetection';

// Performance monitoring (conditionally imported to avoid build errors)
export type {
  RenderInfo,
  PerformanceMetrics
} from './usePerformanceMonitor';

// Import performance hooks conditionally
const performanceHooks = process.env.NODE_ENV === 'development' 
  ? require('./usePerformanceMonitor')
  : {
      useRenderTracker: () => ({ renderCount: 0, getMetrics: () => null }),
      useHookTracker: () => ({ execCount: 0, depChangeCount: 0 }),
      usePerformanceMeasure: () => ({ start: () => {}, end: () => 0 }),
      usePerformanceInsights: () => ({ 
        insights: { slowComponents: [], excessiveRenders: [], recommendations: [] },
        generateInsights: () => {},
        clearMetrics: () => {},
        exportMetrics: () => null,
        getAllMetrics: () => ({})
      }),
      usePerformanceDebugger: () => {}
    };

export const {
  useRenderTracker,
  useHookTracker,
  usePerformanceMeasure,
  usePerformanceInsights,
  usePerformanceDebugger
} = performanceHooks;

// Migration guide for common patterns
export const HOOK_OPTIMIZATION_PATTERNS = {
  // Instead of multiple useState calls
  MULTIPLE_STATE: {
    before: `
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [data, setData] = useState(null);
    `,
    after: `
      const [state, { updateField, updateFields }] = useConsolidatedState({
        loading: false,
        error: null,
        data: null
      });
    `
  },

  // Instead of multiple useCallback calls
  MULTIPLE_CALLBACKS: {
    before: `
      const handleClick = useCallback(() => {}, []);
      const handleSubmit = useCallback(() => {}, []);
      const handleCancel = useCallback(() => {}, []);
    `,
    after: `
      const handlers = useMemoizedCallbacks({
        handleClick: () => {},
        handleSubmit: () => {},
        handleCancel: () => {}
      }, []);
    `
  },

  // Instead of complex async state management
  ASYNC_OPERATIONS: {
    before: `
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [data, setData] = useState(null);
      
      const fetchData = async () => {
        setLoading(true);
        try {
          const result = await api.getData();
          setData(result);
          setError(null);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
    `,
    after: `
      const { data, loading, error, execute } = useAsyncOperation();
      
      const fetchData = () => execute(() => api.getData());
    `
  }
};

// Performance monitoring utilities
export const PERFORMANCE_UTILS = {
  // Add to components that may have performance issues
  trackRenders: (componentName: string, props?: Record<string, unknown>) => {
    // Use in development only
    if (process.env.NODE_ENV === 'development') {
      return performanceHooks.useRenderTracker(componentName, props);
    }
    return { renderCount: 0, getMetrics: () => null };
  },

  // Add to detect memory leaks
  trackMemory: (componentName: string) => {
    if (process.env.NODE_ENV === 'development') {
      const { useMemoryTracker } = require('./useMemoryLeakDetection');
      return useMemoryTracker(componentName);
    }
    return { componentId: '', getMemoryInfo: () => null };
  },

  // Add to debug why components re-render
  debugRenders: (componentName: string, props: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (process.env.NODE_ENV === 'development') {
      const { useWhyDidYouUpdate } = require('./useSimplifiedHooks');
      useWhyDidYouUpdate(componentName, props);
    }
  }
};