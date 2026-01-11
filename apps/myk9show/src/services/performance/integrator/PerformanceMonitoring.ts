/**
 * Performance Monitoring
 *
 * Handles continuous performance monitoring, budget checking, and UX monitoring.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getRumService } from '../RealUserMonitoring';
import type { PerformanceTargets } from './types';

/**
 * Get current bundle size from performance entries
 */
export function getCurrentBundleSize(): number {
  const scriptEntries = performance.getEntriesByType('resource')
    .filter(entry => entry.name.endsWith('.js'))
    .map(entry => entry as PerformanceResourceTiming);

  return Math.round(scriptEntries.reduce((total, entry) => {
    return total + (entry.encodedBodySize || entry.transferSize || 0);
  }, 0) / 1024);
}

/**
 * Performance regression checker
 */
export class PerformanceRegressionChecker {
  constructor(private targets: PerformanceTargets) {}

  /**
   * Check for performance regressions
   */
  check(): void {
    const rumService = getRumService();
    const currentPerformance = rumService.getPerformanceSummary();

    const regressions = [];

    if (currentPerformance.vitals.LCP && currentPerformance.vitals.LCP > this.targets.lcp * 1.1) {
      regressions.push(`LCP regressed to ${currentPerformance.vitals.LCP}ms (target: ${this.targets.lcp}ms)`);
    }

    if (currentPerformance.vitals.FID && currentPerformance.vitals.FID > this.targets.fid * 1.1) {
      regressions.push(`FID regressed to ${currentPerformance.vitals.FID}ms (target: ${this.targets.fid}ms)`);
    }

    if (currentPerformance.vitals.CLS && currentPerformance.vitals.CLS > this.targets.cls * 1.1) {
      regressions.push(`CLS regressed to ${currentPerformance.vitals.CLS} (target: ${this.targets.cls})`);
    }

    if (regressions.length > 0) {
      console.warn('⚠️ Performance regression detected:', regressions);
      rumService.trackCustomMetric('performance_regression_detected', regressions.length, {
        regressions: regressions.join('; '),
      });
    }
  }
}

/**
 * Performance budget monitor
 */
export class PerformanceBudgetMonitor {
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(private targets: PerformanceTargets) {}

  /**
   * Start monitoring performance budgets
   */
  start(): void {
    this.checkInterval = setInterval(() => this.checkBudgets(), 300000); // Every 5 minutes
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private checkBudgets(): void {
    const violations = [];

    // Check bundle size budget
    const currentBundleSize = getCurrentBundleSize();
    if (currentBundleSize > this.targets.bundleSize) {
      violations.push(`Bundle size budget exceeded: ${currentBundleSize}KB > ${this.targets.bundleSize}KB`);
    }

    // Check resource count budget
    const resourceCount = performance.getEntriesByType('resource').length;
    if (resourceCount > 50) {
      violations.push(`Resource count budget exceeded: ${resourceCount} > 50`);
    }

    if (violations.length > 0) {
      console.warn('⚠️ Performance budget violations:', violations);
    }
  }
}

/**
 * UX monitoring for long tasks
 */
export class UXMonitor {
  private longTaskObserver: PerformanceObserver | null = null;

  /**
   * Start UX monitoring
   */
  start(): void {
    if ('PerformanceObserver' in window) {
      this.longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach(entry => {
          const longTask = entry as any;
          if (longTask.duration > 50) {
            console.warn(`Long task detected: ${longTask.duration}ms`);
            getRumService().trackCustomMetric('long_task_detected', longTask.duration);
          }
        });
      });

      try {
        this.longTaskObserver.observe({ type: 'longtask', buffered: true });
      } catch (error) {
        console.warn('Long task monitoring not supported:', error);
      }
    }
  }

  /**
   * Stop UX monitoring
   */
  stop(): void {
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
      this.longTaskObserver = null;
    }
  }
}

/**
 * Performance metrics calculator
 */
export class PerformanceMetricsCalculator {
  constructor(
    private targets: PerformanceTargets,
    private baseline: PerformanceTargets
  ) {}

  /**
   * Calculate performance improvements
   */
  calculateImprovements(finalMetrics: any): any {
    return {
      lcp: Math.max(0, this.baseline.lcp - (finalMetrics.vitals.LCP || this.baseline.lcp)),
      fid: Math.max(0, this.baseline.fid - (finalMetrics.vitals.FID || this.baseline.fid)),
      cls: Math.max(0, this.baseline.cls - (finalMetrics.vitals.CLS || this.baseline.cls)),
      bundleSize: Math.max(0, this.baseline.bundleSize - getCurrentBundleSize()),
    };
  }

  /**
   * Validate results against targets
   */
  validateAgainstTargets(finalMetrics: any): any {
    const results = {
      lcp: (finalMetrics.vitals.LCP || this.baseline.lcp) <= this.targets.lcp,
      fid: (finalMetrics.vitals.FID || this.baseline.fid) <= this.targets.fid,
      cls: (finalMetrics.vitals.CLS || this.baseline.cls) <= this.targets.cls,
      bundleSize: getCurrentBundleSize() <= this.targets.bundleSize,
      targetsMet: 0,
      totalTargets: 0,
    };

    const targetResults = [results.lcp, results.fid, results.cls, results.bundleSize];
    results.targetsMet = targetResults.filter(Boolean).length;
    results.totalTargets = targetResults.length;

    return results;
  }

  /**
   * Calculate overall performance score
   */
  calculateScore(metrics: PerformanceTargets): number {
    const scores = {
      lcp: Math.max(0, 100 - (metrics.lcp - this.targets.lcp) / this.targets.lcp * 100),
      fid: Math.max(0, 100 - (metrics.fid - this.targets.fid) / this.targets.fid * 100),
      cls: Math.max(0, 100 - (metrics.cls - this.targets.cls) / this.targets.cls * 100),
      bundleSize: Math.max(0, 100 - (metrics.bundleSize - this.targets.bundleSize) / this.targets.bundleSize * 100),
    };

    const weightedScore = (
      scores.lcp * 0.3 +
      scores.fid * 0.25 +
      scores.cls * 0.25 +
      scores.bundleSize * 0.2
    );

    return Math.max(0, Math.min(100, Math.round(weightedScore)));
  }

  /**
   * Log final results
   */
  logFinalResults(optimizationStartTime: number): void {
    const rumService = getRumService();
    const finalMetrics = rumService.getPerformanceSummary();
    const improvements = this.calculateImprovements(finalMetrics);
    const validationResults = this.validateAgainstTargets(finalMetrics);

    console.log(`
🎯 Performance Optimization Results
=====================================

Initial Metrics:
- LCP: ${this.baseline.lcp}ms
- FID: ${this.baseline.fid}ms
- CLS: ${this.baseline.cls}
- Bundle Size: ${this.baseline.bundleSize}KB

Final Metrics:
- LCP: ${finalMetrics.vitals.LCP || 'N/A'}ms
- FID: ${finalMetrics.vitals.FID || 'N/A'}ms
- CLS: ${finalMetrics.vitals.CLS || 'N/A'}
- Bundle Size: ${getCurrentBundleSize()}KB

Improvements:
- LCP: -${improvements.lcp}ms (${improvements.lcp > 0 ? '✅' : '❌'})
- FID: -${improvements.fid}ms (${improvements.fid >= 0 ? '✅' : '❌'})
- CLS: -${improvements.cls.toFixed(3)} (${improvements.cls >= 0 ? '✅' : '❌'})
- Bundle Size: -${improvements.bundleSize}KB (${improvements.bundleSize > 0 ? '✅' : '❌'})

Targets Met: ${validationResults.targetsMet}/${validationResults.totalTargets}

Total Optimization Time: ${Math.round((Date.now() - optimizationStartTime) / 1000)}s
    `);
  }
}
