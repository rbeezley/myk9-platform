/**
 * Performance Budget Monitoring Service
 * 
 * Monitors application performance against defined budgets and alerts
 * when thresholds are exceeded. Integrates with Web Vitals API.
 */

import { 
  BudgetViolation,
  ViolationSeverity,
  checkBudgetViolation,
  getPerformanceBudget,
  BUDGET_METRICS,
  type BudgetMetric
} from '@/config/performance-budget';
import { logger } from '@/services/LoggingService';
import { monitoring } from '@/services/MonitoringService';

interface PerformanceMetric {
  name: BudgetMetric;
  value: number;
  timestamp: number;
  url?: string;
  userAgent?: string;
}

interface WebVitalsEntry {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

interface BundleAnalysis {
  totalSize: number;
  mainChunkSize: number;
  vendorChunkSize: number;
  chunkCount: number;
  cssSize: number;
  gzippedSize?: number;
}

interface PerformanceMetricSummary {
  latest: number;
  average: number;
  count: number;
  timestamp: number;
}

interface PerformanceSummaryReport {
  budget: unknown;
  violations: number;
  criticalViolations: number;
  recentMetrics: Record<string, PerformanceMetricSummary>;
  recommendations: string[];
}

// Extend the Performance interface to include memory
declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

export class PerformanceBudgetService {
  private static instance: PerformanceBudgetService;
  private metrics: Map<BudgetMetric, PerformanceMetric[]> = new Map();
  private violations: BudgetViolation[] = [];
  private observers: PerformanceObserver[] = [];
  private budget = getPerformanceBudget();
  private isInitialized = false;

  private constructor() {
    this.initializeWebVitals();
    this.initializePerformanceObservers();
    this.schedulePeriodicChecks();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PerformanceBudgetService {
    if (!PerformanceBudgetService.instance) {
      PerformanceBudgetService.instance = new PerformanceBudgetService();
    }
    return PerformanceBudgetService.instance;
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private async initializeWebVitals(): Promise<void> {
    try {
      // Dynamic import to avoid SSR issues
      const { onCLS, onINP, onFCP, onLCP, onTTFB } = await import('web-vitals');

      // Cumulative Layout Shift
      onCLS((metric: WebVitalsEntry) => {
        this.recordMetric(BUDGET_METRICS.CORE_WEB_VITALS_CLS, metric.value);
        this.checkCoreWebVitalsBudget('cumulativeLayoutShift', metric.value);
      });

      // Interaction to Next Paint (replaces FID in v4)
      onINP((metric: WebVitalsEntry) => {
        this.recordMetric(BUDGET_METRICS.CORE_WEB_VITALS_FID, metric.value);
        this.checkCoreWebVitalsBudget('firstInputDelay', metric.value);
      });

      // First Contentful Paint
      onFCP((metric: WebVitalsEntry) => {
        this.recordMetric(BUDGET_METRICS.LOAD_TIME_FCP, metric.value);
        this.checkLoadingTimeBudget('firstContentfulPaint', metric.value);
      });

      // Largest Contentful Paint
      onLCP((metric: WebVitalsEntry) => {
        this.recordMetric(BUDGET_METRICS.CORE_WEB_VITALS_LCP, metric.value);
        this.checkCoreWebVitalsBudget('largestContentfulPaint', metric.value);
        this.checkLoadingTimeBudget('largestContentfulPaint', metric.value);
      });

      // Time to First Byte
      onTTFB((metric: WebVitalsEntry) => {
        logger.info('Performance: TTFB recorded', 'performance', { 
          value: metric.value,
          rating: metric.rating 
        });
      });

    } catch (error) {
      logger.warn('Failed to initialize Web Vitals', 'performance', { error });
    }
  }

  /**
   * Initialize Performance API observers
   */
  private initializePerformanceObservers(): void {
    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      return;
    }

    try {
      // Navigation timing observer
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            
            // Time to Interactive approximation
            const tti = navEntry.domInteractive - navEntry.fetchStart;
            this.recordMetric(BUDGET_METRICS.LOAD_TIME_TTI, tti);
            this.checkLoadingTimeBudget('timeToInteractive', tti);
          }
        }
      });

      navObserver.observe({ entryTypes: ['navigation'] });
      this.observers.push(navObserver);

      // Memory observer (if supported)
      if ('memory' in performance) {
        this.startMemoryMonitoring();
      }

    } catch (error) {
      logger.warn('Failed to initialize performance observers', 'performance', { error });
    }
  }

  /**
   * Start memory usage monitoring
   */
  private startMemoryMonitoring(): void {
    const checkMemory = () => {
      if ('memory' in performance) {
        const memory = performance.memory;
        const heapSizeMB = memory?.usedJSHeapSize ? memory.usedJSHeapSize / (1024 * 1024) : 0;
        
        this.recordMetric(BUDGET_METRICS.MEMORY_HEAP_SIZE, heapSizeMB);
        this.checkMemoryBudget('heapSize', heapSizeMB);
      }

      // Check DOM nodes
      const domNodes = document.querySelectorAll('*').length;
      this.recordMetric(BUDGET_METRICS.MEMORY_DOM_NODES, domNodes);
      this.checkMemoryBudget('domNodes', domNodes);
    };

    // Check memory every 30 seconds
    setInterval(checkMemory, 30000);
    checkMemory(); // Initial check
  }

  /**
   * Schedule periodic budget checks
   */
  private schedulePeriodicChecks(): void {
    // Check budgets every 5 minutes
    setInterval(() => {
      this.performComprehensiveCheck();
    }, 5 * 60 * 1000);

    // Initial check after 10 seconds
    setTimeout(() => {
      this.performComprehensiveCheck();
    }, 10000);
  }

  /**
   * Record a performance metric
   */
  public recordMetric(name: BudgetMetric, value: number): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      url: window.location?.href,
      userAgent: navigator?.userAgent
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metricHistory = this.metrics.get(name)!;
    metricHistory.push(metric);

    // Keep only last 100 entries per metric
    if (metricHistory.length > 100) {
      metricHistory.shift();
    }

    logger.debug('Performance metric recorded', 'performance', {
      metric: name,
      value,
      url: metric.url
    });
  }

  /**
   * Check bundle size against budget
   */
  public checkBundleSize(analysis: BundleAnalysis): BudgetViolation[] {
    const violations: BudgetViolation[] = [];

    // Check main chunk size
    const mainViolation = checkBudgetViolation(
      'Main Chunk Size',
      'bundleSize',
      analysis.mainChunkSize / 1024,
      this.budget.bundleSize.main
    );
    if (mainViolation) violations.push(mainViolation);

    // Check vendor chunk size
    const vendorViolation = checkBudgetViolation(
      'Vendor Chunk Size',
      'bundleSize',
      analysis.vendorChunkSize / 1024,
      this.budget.bundleSize.vendor
    );
    if (vendorViolation) violations.push(vendorViolation);

    // Check total bundle size
    const totalViolation = checkBudgetViolation(
      'Total Bundle Size',
      'bundleSize',
      analysis.totalSize / 1024,
      this.budget.bundleSize.total
    );
    if (totalViolation) violations.push(totalViolation);

    // Check CSS size
    const cssViolation = checkBudgetViolation(
      'CSS Bundle Size',
      'bundleSize',
      analysis.cssSize / 1024,
      this.budget.bundleSize.css
    );
    if (cssViolation) violations.push(cssViolation);

    // Record violations
    violations.forEach(violation => this.addViolation(violation));

    return violations;
  }

  /**
   * Check Core Web Vitals budget
   */
  private checkCoreWebVitalsBudget(metric: keyof typeof this.budget.coreWebVitals, value: number): void {
    const budget = this.budget.coreWebVitals[metric];
    const violation = checkBudgetViolation(
      `Core Web Vital: ${metric}`,
      'coreWebVitals',
      value,
      budget
    );

    if (violation) {
      this.addViolation(violation);
    }
  }

  /**
   * Check loading time budget
   */
  private checkLoadingTimeBudget(metric: keyof typeof this.budget.loadingTimes, value: number): void {
    const budget = this.budget.loadingTimes[metric];
    const violation = checkBudgetViolation(
      `Loading Time: ${metric}`,
      'loadingTimes',
      value,
      budget
    );

    if (violation) {
      this.addViolation(violation);
    }
  }

  /**
   * Check memory budget
   */
  private checkMemoryBudget(metric: keyof typeof this.budget.memory, value: number): void {
    const budget = this.budget.memory[metric];
    const violation = checkBudgetViolation(
      `Memory: ${metric}`,
      'memory',
      value,
      budget
    );

    if (violation) {
      this.addViolation(violation);
    }
  }

  /**
   * Add a budget violation
   */
  private addViolation(violation: BudgetViolation): void {
    this.violations.push(violation);

    // Log violation
    logger.warn('Performance budget violation', 'performance', {
      metric: violation.metric,
      actual: violation.actual,
      budget: violation.budget,
      severity: violation.severity,
      percentage: violation.percentage
    });

    // Send to monitoring service
    // Send to monitoring service (if method exists)
    if ('trackEvent' in monitoring && typeof monitoring.trackEvent === 'function') {
      (monitoring as unknown as { trackEvent: (event: string, properties: Record<string, unknown>) => void }).trackEvent('performance_budget_violation', {
        metric: violation.metric,
        category: violation.category,
        severity: violation.severity,
        percentage: violation.percentage
      });
    }

    // Keep only last 50 violations
    if (this.violations.length > 50) {
      this.violations.shift();
    }

    // Alert for critical violations
    if (violation.severity === ViolationSeverity.CRITICAL) {
      this.alertCriticalViolation(violation);
    }
  }

  /**
   * Alert for critical violations
   */
  private alertCriticalViolation(violation: BudgetViolation): void {
    logger.error('Critical performance budget violation', 'performance', {
      violation,
      url: window.location?.href,
      timestamp: new Date().toISOString()
    });

    // In production, this could send alerts to monitoring systems
    if (process.env.NODE_ENV === 'production') {
      logger.error('🚨 CRITICAL PERFORMANCE VIOLATION:', 'services', {}, violation as Error);
    }
  }

  /**
   * Perform comprehensive performance check
   */
  private performComprehensiveCheck(): void {
    try {
      // Check current performance state
      this.checkResourceBudgets();
      this.generatePerformanceReport();
      
    } catch (error) {
      logger.error('Comprehensive performance check failed', 'performance', { error });
    }
  }

  /**
   * Check resource budgets
   */
  private checkResourceBudgets(): void {
    if (typeof window === 'undefined') return;

    // Count current resources
    const scripts = document.querySelectorAll('script').length;
    const images = document.querySelectorAll('img').length;
    // Count stylesheets (currently not used in budget checks)
    // const stylesheets = document.querySelectorAll('link[rel="stylesheet"]').length;

    // Check against budgets
    const scriptViolation = checkBudgetViolation(
      'Script Count',
      'resources',
      scripts,
      this.budget.resources.maxScripts
    );
    if (scriptViolation) this.addViolation(scriptViolation);

    const imageViolation = checkBudgetViolation(
      'Image Count',
      'resources',
      images,
      this.budget.resources.maxImages
    );
    if (imageViolation) this.addViolation(imageViolation);
  }

  /**
   * Generate performance report
   */
  private generatePerformanceReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      budget: this.budget,
      violations: this.violations.slice(-10), // Last 10 violations
      metrics: this.getMetricsSummary(),
      recommendations: this.generateRecommendations()
    };

    logger.info('Performance budget report generated', 'performance', { report });
  }

  /**
   * Get metrics summary
   */
  private getMetricsSummary(): Record<string, PerformanceMetricSummary> {
    const summary: Record<string, PerformanceMetricSummary> = {};

    for (const [metricName, metricHistory] of this.metrics.entries()) {
      if (metricHistory.length > 0) {
        const latest = metricHistory[metricHistory.length - 1];
        const average = metricHistory.reduce((sum, m) => sum + m.value, 0) / metricHistory.length;
        
        summary[metricName] = {
          latest: latest.value,
          average: Math.round(average * 100) / 100,
          count: metricHistory.length,
          timestamp: latest.timestamp
        };
      }
    }

    return summary;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const recentViolations = this.violations.slice(-5);

    if (recentViolations.some(v => v.category === 'bundleSize')) {
      recommendations.push('Consider implementing code splitting and lazy loading');
    }

    if (recentViolations.some(v => v.category === 'loadingTimes')) {
      recommendations.push('Optimize critical rendering path and reduce blocking resources');
    }

    if (recentViolations.some(v => v.category === 'memory')) {
      recommendations.push('Check for memory leaks and optimize component lifecycle');
    }

    if (recentViolations.some(v => v.category === 'resources')) {
      recommendations.push('Reduce HTTP requests and optimize resource loading');
    }

    return recommendations;
  }

  /**
   * Get current violations
   */
  public getViolations(): BudgetViolation[] {
    return [...this.violations];
  }

  /**
   * Get metric history
   */
  public getMetricHistory(metric: BudgetMetric): PerformanceMetric[] {
    return this.metrics.get(metric) || [];
  }

  /**
   * Get current performance summary
   */
  public getPerformanceSummary(): PerformanceSummaryReport {
    return {
      budget: this.budget,
      violations: this.violations.length,
      criticalViolations: this.violations.filter(v => v.severity === ViolationSeverity.CRITICAL).length,
      recentMetrics: this.getMetricsSummary(),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Clear old data
   */
  public clearOldData(): void {
    // Clear violations older than 24 hours
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const [metricName, metricHistory] of this.metrics.entries()) {
      const filteredHistory = metricHistory.filter(m => m.timestamp > dayAgo);
      this.metrics.set(metricName, filteredHistory);
    }

    logger.info('Old performance data cleared', 'performance');
  }

  /**
   * Cleanup observers
   */
  public cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.metrics.clear();
    this.violations = [];
  }
}

// Export singleton instance
export const performanceBudgetService = PerformanceBudgetService.getInstance();