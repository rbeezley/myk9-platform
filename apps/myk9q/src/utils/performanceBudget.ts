/**
 * Performance Budget System
 *
 * Defines target metrics for Core Web Vitals and monitors adherence.
 * Alerts when performance regresses beyond acceptable thresholds.
 */

import { logger } from '@/utils/logger';

/**
 * Largest Contentful Paint entry type
 * @see https://developer.mozilla.org/en-US/docs/Web/API/LargestContentfulPaint
 */
interface LargestContentfulPaintEntry extends PerformanceEntry {
  renderTime: number;
  loadTime: number;
  size: number;
  element?: Element;
  url: string;
  id: string;
}

/**
 * First Input Delay entry type (PerformanceEventTiming)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming
 */
interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
  processingEnd: number;
  cancelable: boolean;
  target?: Node;
}

/**
 * Layout Shift entry type
 * @see https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift
 */
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
  lastInputTime: number;
  sources: Array<{
    node?: Node;
    previousRect: DOMRectReadOnly;
    currentRect: DOMRectReadOnly;
  }>;
}

export interface PerformanceMetrics {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;

  /** First Input Delay (ms) */
  fid: number | null;

  /** Cumulative Layout Shift */
  cls: number | null;

  /** First Contentful Paint (ms) */
  fcp: number | null;

  /** Time to Interactive (ms) */
  tti: number | null;

  /** Total Blocking Time (ms) */
  tbt: number | null;

  /** Speed Index */
  si: number | null;
}

export interface PerformanceBudget {
  /** Metric thresholds */
  thresholds: {
    lcp: { good: number; needsImprovement: number };
    fid: { good: number; needsImprovement: number };
    cls: { good: number; needsImprovement: number };
    fcp: { good: number; needsImprovement: number };
    tti: { good: number; needsImprovement: number };
    tbt: { good: number; needsImprovement: number };
  };

  /** Resource size limits (KB) */
  resources: {
    javascript: number;
    css: number;
    images: number;
    fonts: number;
    total: number;
  };

  /** Request count limits */
  requests: {
    total: number;
    javascript: number;
    css: number;
    images: number;
  };
}

/**
 * Default performance budget (based on Core Web Vitals)
 */
export const DEFAULT_BUDGET: PerformanceBudget = {
  thresholds: {
    // Largest Contentful Paint
    lcp: {
      good: 2500, // < 2.5s is good
      needsImprovement: 4000, // < 4s needs improvement
    },

    // First Input Delay
    fid: {
      good: 100, // < 100ms is good
      needsImprovement: 300, // < 300ms needs improvement
    },

    // Cumulative Layout Shift
    cls: {
      good: 0.1, // < 0.1 is good
      needsImprovement: 0.25, // < 0.25 needs improvement
    },

    // First Contentful Paint
    fcp: {
      good: 1800, // < 1.8s is good
      needsImprovement: 3000, // < 3s needs improvement
    },

    // Time to Interactive
    tti: {
      good: 3800, // < 3.8s is good
      needsImprovement: 7300, // < 7.3s needs improvement
    },

    // Total Blocking Time
    tbt: {
      good: 200, // < 200ms is good
      needsImprovement: 600, // < 600ms needs improvement
    },
  },

  resources: {
    javascript: 350, // 350 KB max JS
    css: 100, // 100 KB max CSS
    images: 500, // 500 KB max images per page
    fonts: 100, // 100 KB max fonts
    total: 1000, // 1 MB total per page
  },

  requests: {
    total: 50, // Max 50 requests per page
    javascript: 10, // Max 10 JS files
    css: 5, // Max 5 CSS files
    images: 30, // Max 30 images
  },
};

export type MetricRating = 'good' | 'needs-improvement' | 'poor' | 'unknown';

/**
 * Get rating for a specific metric
 */
export function getMetricRating(
  metricName: keyof PerformanceMetrics,
  value: number | null,
  budget: PerformanceBudget = DEFAULT_BUDGET
): MetricRating {
  if (value === null) {
    return 'unknown';
  }

  const threshold = budget.thresholds[metricName as keyof typeof budget.thresholds];
  if (!threshold) {
    return 'unknown';
  }

  if (value <= threshold.good) {
    return 'good';
  }

  if (value <= threshold.needsImprovement) {
    return 'needs-improvement';
  }

  return 'poor';
}

/**
 * Collect current performance metrics
 */
export function collectMetrics(): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    lcp: null,
    fid: null,
    cls: null,
    fcp: null,
    tti: null,
    tbt: null,
    si: null,
  };

  // Use Performance Observer API for Core Web Vitals
  if ('PerformanceObserver' in window) {
    try {
      // LCP
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as LargestContentfulPaintEntry;
        metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // FID
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const fidEntry = entry as FirstInputEntry;
          metrics.fid = fidEntry.processingStart - fidEntry.startTime;
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });

      // CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const layoutEntry = entry as LayoutShiftEntry;
          if (!layoutEntry.hadRecentInput) {
            clsValue += layoutEntry.value;
            metrics.cls = clsValue;
          }
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (error) {
      logger.warn('Performance Observer not fully supported:', error);
    }
  }

  // Navigation Timing API for other metrics
  if ('performance' in window && performance.getEntriesByType) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigation) {
      metrics.fcp = navigation.responseEnd - navigation.fetchStart;
      metrics.tti = navigation.domInteractive - navigation.fetchStart;
      metrics.tbt = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
    }
  }

  return metrics;
}

/**
 * Check if metrics meet budget requirements
 */
export function checkBudget(
  metrics: PerformanceMetrics,
  budget: PerformanceBudget = DEFAULT_BUDGET
): {
  passed: boolean;
  violations: Array<{
    metric: keyof PerformanceMetrics;
    value: number;
    threshold: number;
    rating: MetricRating;
  }>;
} {
  const violations: Array<{
    metric: keyof PerformanceMetrics;
    value: number;
    threshold: number;
    rating: MetricRating;
  }> = [];

  // Check each metric
  Object.keys(metrics).forEach((key) => {
    const metricName = key as keyof PerformanceMetrics;
    const value = metrics[metricName];

    if (value !== null) {
      const rating = getMetricRating(metricName, value, budget);

      if (rating === 'poor') {
        const threshold = budget.thresholds[metricName as keyof typeof budget.thresholds];
        if (threshold) {
          violations.push({
            metric: metricName,
            value,
            threshold: threshold.needsImprovement,
            rating,
          });
        }
      }
    }
  });

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Analyze resource usage
 */
export function analyzeResources(
  budget: PerformanceBudget = DEFAULT_BUDGET
): {
  usage: {
    javascript: number;
    css: number;
    images: number;
    fonts: number;
    total: number;
  };
  counts: {
    javascript: number;
    css: number;
    images: number;
    total: number;
  };
  violations: string[];
} {
  const usage = {
    javascript: 0,
    css: 0,
    images: 0,
    fonts: 0,
    total: 0,
  };

  const counts = {
    javascript: 0,
    css: 0,
    images: 0,
    total: 0,
  };

  const violations: string[] = [];

  // Get all resources
  if ('performance' in window && performance.getEntriesByType) {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    resources.forEach((resource) => {
      const size = resource.transferSize / 1024; // Convert to KB
      counts.total++;
      usage.total += size;

      if (resource.initiatorType === 'script') {
        counts.javascript++;
        usage.javascript += size;
      } else if (resource.initiatorType === 'link' && resource.name.includes('.css')) {
        counts.css++;
        usage.css += size;
      } else if (resource.initiatorType === 'img') {
        counts.images++;
        usage.images += size;
      } else if (resource.name.includes('font')) {
        usage.fonts += size;
      }
    });
  }

  // Check violations
  if (usage.javascript > budget.resources.javascript) {
    violations.push(
      `JavaScript: ${usage.javascript.toFixed(1)} KB exceeds ${budget.resources.javascript} KB budget`
    );
  }

  if (usage.css > budget.resources.css) {
    violations.push(
      `CSS: ${usage.css.toFixed(1)} KB exceeds ${budget.resources.css} KB budget`
    );
  }

  if (usage.images > budget.resources.images) {
    violations.push(
      `Images: ${usage.images.toFixed(1)} KB exceeds ${budget.resources.images} KB budget`
    );
  }

  if (usage.total > budget.resources.total) {
    violations.push(
      `Total: ${usage.total.toFixed(1)} KB exceeds ${budget.resources.total} KB budget`
    );
  }

  if (counts.total > budget.requests.total) {
    violations.push(
      `Total requests: ${counts.total} exceeds ${budget.requests.total} limit`
    );
  }

  if (counts.javascript > budget.requests.javascript) {
    violations.push(
      `JavaScript requests: ${counts.javascript} exceeds ${budget.requests.javascript} limit`
    );
  }

  return { usage, counts, violations };
}

/**
 * Generate performance report
 */
export function generateReport(
  metrics: PerformanceMetrics,
  budget: PerformanceBudget = DEFAULT_BUDGET
): {
  score: number;
  metrics: PerformanceMetrics;
  ratings: Record<keyof PerformanceMetrics, MetricRating>;
  budget: ReturnType<typeof checkBudget>;
  resources: ReturnType<typeof analyzeResources>;
  recommendations: string[];
} {
  const ratings: Record<keyof PerformanceMetrics, MetricRating> = {
    lcp: getMetricRating('lcp', metrics.lcp, budget),
    fid: getMetricRating('fid', metrics.fid, budget),
    cls: getMetricRating('cls', metrics.cls, budget),
    fcp: getMetricRating('fcp', metrics.fcp, budget),
    tti: getMetricRating('tti', metrics.tti, budget),
    tbt: getMetricRating('tbt', metrics.tbt, budget),
    si: 'unknown',
  };

  const budgetCheck = checkBudget(metrics, budget);
  const resources = analyzeResources(budget);

  // Calculate score (0-100)
  const weights = {
    lcp: 25,
    fid: 25,
    cls: 25,
    fcp: 10,
    tti: 10,
    tbt: 5,
  };

  let score = 0;
  let totalWeight = 0;

  Object.entries(ratings).forEach(([key, rating]) => {
    const weight = weights[key as keyof typeof weights] || 0;
    if (rating !== 'unknown' && weight > 0) {
      totalWeight += weight;
      if (rating === 'good') score += weight;
      else if (rating === 'needs-improvement') score += weight * 0.5;
    }
  });

  score = totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0;

  // Generate recommendations
  const recommendations: string[] = [];

  if (ratings.lcp === 'poor') {
    recommendations.push('Optimize Largest Contentful Paint: Reduce server response time, optimize images');
  }

  if (ratings.fid === 'poor') {
    recommendations.push('Improve First Input Delay: Minimize JavaScript execution time');
  }

  if (ratings.cls === 'poor') {
    recommendations.push('Reduce Cumulative Layout Shift: Add size attributes to images, reserve space for ads');
  }

  if (resources.violations.length > 0) {
    recommendations.push(...resources.violations);
  }

  return {
    score,
    metrics,
    ratings,
    budget: budgetCheck,
    resources,
    recommendations,
  };
}

/**
 * Monitor performance and alert on regression
 */
export function startBudgetMonitoring(
  onViolation: (report: ReturnType<typeof generateReport>) => void,
  intervalMs: number = 30000 // Check every 30 seconds
): () => void {
  const check = () => {
    const metrics = collectMetrics();
    const report = generateReport(metrics);

    if (!report.budget.passed || report.resources.violations.length > 0) {
      onViolation(report);
    }
  };

  // Initial check
  check();

  // Periodic checks
  const interval = setInterval(check, intervalMs);

  // Return cleanup function
  return () => clearInterval(interval);
}
