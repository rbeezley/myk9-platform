/**
 * Performance Budget Configuration
 * 
 * Defines performance thresholds and budget limits for the application.
 * Used by build tools, monitoring services, and CI/CD pipelines.
 */

export interface PerformanceBudget {
  // Bundle size budgets (in KB)
  bundleSize: {
    main: number;
    vendor: number;
    chunk: number;
    total: number;
    css: number;
    gzip: {
      main: number;
      vendor: number;
      chunk: number;
      total: number;
    };
  };
  
  // Loading performance budgets (in milliseconds)
  loadingTimes: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    timeToInteractive: number;
    firstInputDelay: number;
  };
  
  // Core Web Vitals thresholds
  coreWebVitals: {
    cumulativeLayoutShift: number;
    firstInputDelay: number;
    largestContentfulPaint: number;
  };
  
  // Resource budgets
  resources: {
    maxRequests: number;
    maxImages: number;
    maxFonts: number;
    maxScripts: number;
  };
  
  // Memory budgets (in MB)
  memory: {
    heapSize: number;
    domNodes: number;
    eventListeners: number;
  };
}

/**
 * Production performance budget
 * Based on Google's recommendations and real-world benchmarks
 */
export const PERFORMANCE_BUDGET: PerformanceBudget = {
  bundleSize: {
    main: 500,          // Main application chunk (KB)
    vendor: 800,        // Vendor libraries chunk (KB)
    chunk: 244,         // Individual chunks (Lighthouse recommendation)
    total: 1500,        // Total bundle size (KB)
    css: 100,           // CSS bundle size (KB)
    gzip: {
      main: 150,        // Gzipped main chunk (KB)
      vendor: 250,      // Gzipped vendor chunk (KB)
      chunk: 100,       // Gzipped individual chunks (KB)
      total: 500        // Total gzipped size (KB)
    }
  },
  
  loadingTimes: {
    firstContentfulPaint: 1500,     // FCP target (ms)
    largestContentfulPaint: 2500,   // LCP target (ms)
    timeToInteractive: 3000,        // TTI target (ms)
    firstInputDelay: 100            // FID target (ms)
  },
  
  coreWebVitals: {
    cumulativeLayoutShift: 0.1,     // CLS threshold
    firstInputDelay: 100,           // FID threshold (ms)
    largestContentfulPaint: 2500    // LCP threshold (ms)
  },
  
  resources: {
    maxRequests: 50,      // Maximum HTTP requests
    maxImages: 20,        // Maximum image requests
    maxFonts: 4,          // Maximum font files
    maxScripts: 10        // Maximum script files
  },
  
  memory: {
    heapSize: 50,         // Maximum heap size (MB)
    domNodes: 2000,       // Maximum DOM nodes
    eventListeners: 500   // Maximum event listeners
  }
};

/**
 * Development performance budget (more lenient)
 */
export const DEV_PERFORMANCE_BUDGET: PerformanceBudget = {
  bundleSize: {
    main: 1000,         // Larger for development
    vendor: 1500,
    chunk: 500,
    total: 3000,
    css: 200,
    gzip: {
      main: 300,
      vendor: 500,
      chunk: 200,
      total: 1000
    }
  },
  
  loadingTimes: {
    firstContentfulPaint: 3000,
    largestContentfulPaint: 5000,
    timeToInteractive: 8000,
    firstInputDelay: 300
  },
  
  coreWebVitals: {
    cumulativeLayoutShift: 0.25,
    firstInputDelay: 300,
    largestContentfulPaint: 5000
  },
  
  resources: {
    maxRequests: 100,
    maxImages: 50,
    maxFonts: 8,
    maxScripts: 20
  },
  
  memory: {
    heapSize: 100,
    domNodes: 5000,
    eventListeners: 1000
  }
};

/**
 * Warning thresholds (percentage of budget)
 */
export const WARNING_THRESHOLDS = {
  amber: 0.8,    // 80% of budget - show warning
  red: 0.95      // 95% of budget - critical warning
};

/**
 * Get the appropriate budget based on environment
 */
export function getPerformanceBudget(): PerformanceBudget {
  return process.env.NODE_ENV === 'production' 
    ? PERFORMANCE_BUDGET 
    : DEV_PERFORMANCE_BUDGET;
}

/**
 * Budget violation severity levels
 */
export enum ViolationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Performance budget violation interface
 */
export interface BudgetViolation {
  metric: string;
  category: keyof PerformanceBudget;
  actual: number;
  budget: number;
  severity: ViolationSeverity;
  percentage: number;
  recommendation?: string;
}

/**
 * Check if a metric violates the budget
 */
export function checkBudgetViolation(
  metric: string,
  category: keyof PerformanceBudget,
  actual: number,
  budget: number
): BudgetViolation | null {
  if (actual <= budget) return null;
  
  const percentage = (actual / budget) * 100;
  let severity: ViolationSeverity;
  
  if (percentage > 150) {
    severity = ViolationSeverity.CRITICAL;
  } else if (percentage > 120) {
    severity = ViolationSeverity.ERROR;
  } else if (percentage > 100) {
    severity = ViolationSeverity.WARNING;
  } else {
    severity = ViolationSeverity.INFO;
  }
  
  return {
    metric,
    category,
    actual,
    budget,
    severity,
    percentage: Math.round(percentage),
    recommendation: getRecommendation(metric, category, severity)
  };
}

/**
 * Get optimization recommendations based on violation
 */
function getRecommendation(
  metric: string, 
  category: keyof PerformanceBudget, 
  severity: ViolationSeverity
): string {
  const recommendations: Record<keyof PerformanceBudget, Record<ViolationSeverity, string>> = {
    bundleSize: {
      [ViolationSeverity.INFO]: 'Monitor bundle size growth',
      [ViolationSeverity.WARNING]: 'Consider code splitting or lazy loading',
      [ViolationSeverity.ERROR]: 'Implement aggressive code splitting and tree shaking',
      [ViolationSeverity.CRITICAL]: 'Major refactoring needed - remove heavy dependencies'
    },
    loadingTimes: {
      [ViolationSeverity.INFO]: 'Monitor loading performance',
      [ViolationSeverity.WARNING]: 'Optimize critical path rendering',
      [ViolationSeverity.ERROR]: 'Implement performance monitoring and optimization',
      [ViolationSeverity.CRITICAL]: 'Complete performance audit required'
    },
    coreWebVitals: {
      [ViolationSeverity.INFO]: 'Monitor Core Web Vitals',
      [ViolationSeverity.WARNING]: 'Optimize user experience metrics',
      [ViolationSeverity.ERROR]: 'Address Core Web Vitals issues immediately',
      [ViolationSeverity.CRITICAL]: 'Critical UX performance issues detected'
    },
    resources: {
      [ViolationSeverity.INFO]: 'Monitor resource usage',
      [ViolationSeverity.WARNING]: 'Reduce HTTP requests and optimize resources',
      [ViolationSeverity.ERROR]: 'Implement resource bundling and compression',
      [ViolationSeverity.CRITICAL]: 'Major architecture changes needed'
    },
    memory: {
      [ViolationSeverity.INFO]: 'Monitor memory usage',
      [ViolationSeverity.WARNING]: 'Check for memory leaks and optimize components',
      [ViolationSeverity.ERROR]: 'Implement virtual scrolling and component cleanup',
      [ViolationSeverity.CRITICAL]: 'Complete memory profiling and optimization required'
    }
  };
  
  return recommendations[category]?.[severity] || 'Review and optimize the affected component';
}

/**
 * Performance budget metrics for tracking
 */
export const BUDGET_METRICS = {
  BUNDLE_SIZE_MAIN: 'bundle.size.main',
  BUNDLE_SIZE_VENDOR: 'bundle.size.vendor',
  BUNDLE_SIZE_TOTAL: 'bundle.size.total',
  LOAD_TIME_FCP: 'load.time.fcp',
  LOAD_TIME_LCP: 'load.time.lcp',
  LOAD_TIME_TTI: 'load.time.tti',
  CORE_WEB_VITALS_CLS: 'cwv.cls',
  CORE_WEB_VITALS_FID: 'cwv.fid',
  CORE_WEB_VITALS_LCP: 'cwv.lcp',
  MEMORY_HEAP_SIZE: 'memory.heap.size',
  MEMORY_DOM_NODES: 'memory.dom.nodes'
} as const;

export type BudgetMetric = typeof BUDGET_METRICS[keyof typeof BUDGET_METRICS];