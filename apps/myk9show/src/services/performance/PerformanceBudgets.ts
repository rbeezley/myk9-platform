import { logger } from '@/services/LoggingService';

/**
 * Performance Budgets System
 * 
 * Defines and enforces performance budgets for build-time and runtime
 * metrics to prevent performance regressions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BudgetRule {
  /** Unique identifier for the rule */
  id: string;
  /** Name of the rule */
  name: string;
  /** Description */
  description: string;
  /** Metric to monitor */
  metric: BudgetMetric;
  /** Budget threshold */
  threshold: number;
  /** Unit of measurement */
  unit: string;
  /** Severity level when exceeded */
  severity: 'error' | 'warning' | 'info';
  /** Whether this rule is active */
  enabled: boolean;
  /** Environment where this applies */
  environment: 'build' | 'runtime' | 'both';
}

export type BudgetMetric = 
  // Bundle size metrics
  | 'bundle_size_total'
  | 'bundle_size_js'
  | 'bundle_size_css'
  | 'bundle_size_images'
  | 'chunk_size_max'
  | 'chunk_count'
  
  // Runtime performance metrics
  | 'lcp'
  | 'fcp' 
  | 'cls'
  | 'fid'
  | 'ttfb'
  | 'inp'
  | 'long_task_duration'
  | 'memory_usage'
  | 'dom_nodes'
  
  // Custom app metrics
  | 'store_load_time'
  | 'component_render_time'
  | 'api_response_time'
  | 'search_response_time';

export interface BudgetViolation {
  ruleId: string;
  ruleName: string;
  metric: BudgetMetric;
  threshold: number;
  actualValue: number;
  severity: 'error' | 'warning' | 'info';
  timestamp: number;
  environment: 'build' | 'runtime';
  context?: Record<string, any>;
}

export interface BudgetReport {
  timestamp: number;
  environment: 'build' | 'runtime';
  totalRules: number;
  violationCount: number;
  violations: BudgetViolation[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

// Default performance budgets
export const DEFAULT_BUDGET_RULES: BudgetRule[] = [
  // Bundle Size Budgets
  {
    id: 'bundle-size-total',
    name: 'Total Bundle Size',
    description: 'Total size of all bundled assets should stay under budget',
    metric: 'bundle_size_total',
    threshold: 5000, // 5MB
    unit: 'KB',
    severity: 'error',
    enabled: true,
    environment: 'build',
  },
  {
    id: 'bundle-size-js',
    name: 'JavaScript Bundle Size',
    description: 'Total JavaScript bundle size',
    metric: 'bundle_size_js',
    threshold: 3000, // 3MB
    unit: 'KB',
    severity: 'error',
    enabled: true,
    environment: 'build',
  },
  {
    id: 'bundle-size-css',
    name: 'CSS Bundle Size',
    description: 'Total CSS bundle size',
    metric: 'bundle_size_css',
    threshold: 500, // 500KB
    unit: 'KB',
    severity: 'warning',
    enabled: true,
    environment: 'build',
  },
  {
    id: 'chunk-size-max',
    name: 'Maximum Chunk Size',
    description: 'No single chunk should exceed this size',
    metric: 'chunk_size_max',
    threshold: 1000, // 1MB
    unit: 'KB',
    severity: 'warning',
    enabled: true,
    environment: 'build',
  },
  {
    id: 'chunk-count',
    name: 'Total Chunk Count',
    description: 'Total number of chunks should be reasonable',
    metric: 'chunk_count',
    threshold: 50,
    unit: 'count',
    severity: 'warning',
    enabled: true,
    environment: 'build',
  },

  // Core Web Vitals Budgets
  {
    id: 'lcp-budget',
    name: 'Largest Contentful Paint',
    description: 'LCP should be under 2.5 seconds for good user experience',
    metric: 'lcp',
    threshold: 2500,
    unit: 'ms',
    severity: 'error',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'fcp-budget',
    name: 'First Contentful Paint',
    description: 'FCP should be under 1.8 seconds',
    metric: 'fcp',
    threshold: 1800,
    unit: 'ms',
    severity: 'warning',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'cls-budget',
    name: 'Cumulative Layout Shift',
    description: 'CLS should be under 0.1 for good user experience',
    metric: 'cls',
    threshold: 0.1,
    unit: 'score',
    severity: 'error',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'fid-budget',
    name: 'First Input Delay',
    description: 'FID should be under 100ms',
    metric: 'fid',
    threshold: 100,
    unit: 'ms',
    severity: 'error',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'ttfb-budget',
    name: 'Time to First Byte',
    description: 'TTFB should be under 600ms',
    metric: 'ttfb',
    threshold: 600,
    unit: 'ms',
    severity: 'warning',
    enabled: true,
    environment: 'runtime',
  },

  // Application-specific budgets
  {
    id: 'memory-usage',
    name: 'Memory Usage',
    description: 'JS heap size should stay reasonable',
    metric: 'memory_usage',
    threshold: 150, // 150MB
    unit: 'MB',
    severity: 'warning',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'dom-nodes',
    name: 'DOM Node Count',
    description: 'Total DOM nodes should be under 3000',
    metric: 'dom_nodes',
    threshold: 3000,
    unit: 'count',
    severity: 'warning',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'store-load-time',
    name: 'Store Load Time',
    description: 'Individual store loading should be fast',
    metric: 'store_load_time',
    threshold: 100,
    unit: 'ms',
    severity: 'warning',
    enabled: true,
    environment: 'runtime',
  },
  {
    id: 'long-task-duration',
    name: 'Long Task Duration',
    description: 'Long tasks should be minimized',
    metric: 'long_task_duration',
    threshold: 50,
    unit: 'ms',
    severity: 'error',
    enabled: true,
    environment: 'runtime',
  },
];

export class PerformanceBudgetService {
  private rules: Map<string, BudgetRule> = new Map();
  private violations: BudgetViolation[] = [];
  private reports: BudgetReport[] = [];

  constructor(rules: BudgetRule[] = DEFAULT_BUDGET_RULES) {
    rules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Add or update a budget rule
   */
  public setRule(rule: BudgetRule): void {
    this.rules.set(rule.id, rule);
    logger.debug(`📏 Budget rule set: ${rule.name}`, 'performance', {});
  }

  /**
   * Remove a budget rule
   */
  public removeRule(ruleId: string): boolean {
    const result = this.rules.delete(ruleId);
    if (result) {
      logger.debug(`📏 Budget rule removed: ${ruleId}`, 'performance', {});
    }
    return result;
  }

  /**
   * Get all rules for a specific environment
   */
  public getRulesForEnvironment(environment: 'build' | 'runtime'): BudgetRule[] {
    return Array.from(this.rules.values())
      .filter(rule => 
        rule.enabled && 
        (rule.environment === environment || rule.environment === 'both')
      );
  }

  /**
   * Check a metric against budget rules
   */
  public checkBudget(
    metric: BudgetMetric,
    value: number,
    environment: 'build' | 'runtime',
    context?: Record<string, any>
  ): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const applicableRules = this.getRulesForEnvironment(environment)
      .filter(rule => rule.metric === metric);

    for (const rule of applicableRules) {
      if (value > rule.threshold) {
        const violation: BudgetViolation = {
          ruleId: rule.id,
          ruleName: rule.name,
          metric,
          threshold: rule.threshold,
          actualValue: value,
          severity: rule.severity,
          timestamp: Date.now(),
          environment,
          ...(context !== undefined && { context }),
        };

        violations.push(violation);
        this.violations.push(violation);

        // Log violation
        const emoji = rule.severity === 'error' ? '🚨' : rule.severity === 'warning' ? '⚠️' : 'ℹ️';
        logger.warn(`${emoji} Budget violation: ${rule.name} (${value} ${rule.unit} > ${rule.threshold} ${rule.unit})`, 'performance', {});
      }
    }

    return violations;
  }

  /**
   * Check multiple metrics at once
   */
  public checkBudgets(
    metrics: Record<BudgetMetric, number>,
    environment: 'build' | 'runtime',
    context?: Record<string, any>
  ): BudgetViolation[] {
    const allViolations: BudgetViolation[] = [];

    Object.entries(metrics).forEach(([metric, value]) => {
      const violations = this.checkBudget(metric as BudgetMetric, value, environment, context);
      allViolations.push(...violations);
    });

    return allViolations;
  }

  /**
   * Generate budget report
   */
  public generateReport(environment: 'build' | 'runtime'): BudgetReport {
    const relevantViolations = this.violations.filter(v => v.environment === environment);
    
    const report: BudgetReport = {
      timestamp: Date.now(),
      environment,
      totalRules: this.getRulesForEnvironment(environment).length,
      violationCount: relevantViolations.length,
      violations: relevantViolations,
      summary: {
        errors: relevantViolations.filter(v => v.severity === 'error').length,
        warnings: relevantViolations.filter(v => v.severity === 'warning').length,
        infos: relevantViolations.filter(v => v.severity === 'info').length,
      },
    };

    this.reports.push(report);

    // Keep only last 50 reports
    if (this.reports.length > 50) {
      this.reports = this.reports.slice(-50);
    }

    return report;
  }

  /**
   * Get build-time metrics from bundle stats
   */
  public extractBuildMetrics(stats: any): Record<BudgetMetric, number> {
    const metrics: Partial<Record<BudgetMetric, number>> = {};

    if (stats.assets) {
      let totalSize = 0;
      let jsSize = 0;
      let cssSize = 0;
      let imageSize = 0;
      let maxChunkSize = 0;

      stats.assets.forEach((asset: any) => {
        const size = asset.size / 1024; // Convert to KB
        totalSize += size;
        maxChunkSize = Math.max(maxChunkSize, size);

        if (asset.name.endsWith('.js')) {
          jsSize += size;
        } else if (asset.name.endsWith('.css')) {
          cssSize += size;
        } else if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(asset.name)) {
          imageSize += size;
        }
      });

      metrics.bundle_size_total = totalSize;
      metrics.bundle_size_js = jsSize;
      metrics.bundle_size_css = cssSize;
      metrics.bundle_size_images = imageSize;
      metrics.chunk_size_max = maxChunkSize;
      metrics.chunk_count = stats.assets.length;
    }

    return metrics as Record<BudgetMetric, number>;
  }

  /**
   * Get runtime metrics from performance API
   */
  public extractRuntimeMetrics(): Record<BudgetMetric, number> {
    const metrics: Partial<Record<BudgetMetric, number>> = {};

    // Memory usage
    if ((performance as any).memory) {
      const memory = (performance as any).memory;
      metrics.memory_usage = memory.usedJSHeapSize / 1024 / 1024; // MB
    }

    // DOM nodes
    metrics.dom_nodes = document.getElementsByTagName('*').length;

    // Long tasks (would need to be collected over time)
    const longTaskEntries = performance.getEntriesByType('longtask');
    if (longTaskEntries.length > 0) {
      const maxDuration = Math.max(...longTaskEntries.map(entry => entry.duration));
      metrics.long_task_duration = maxDuration;
    }

    return metrics as Record<BudgetMetric, number>;
  }

  /**
   * Check if build should fail based on violations
   */
  public shouldFailBuild(violations: BudgetViolation[]): boolean {
    return violations.some(violation => violation.severity === 'error');
  }

  /**
   * Export budget configuration
   */
  public exportConfiguration(): BudgetRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Import budget configuration
   */
  public importConfiguration(rules: BudgetRule[]): void {
    this.rules.clear();
    rules.forEach(rule => {
      this.rules.set(rule.id, rule);
    });
    logger.debug(`📏 Imported ${rules.length} budget rules`, 'performance', {});
  }

  /**
   * Get violation history
   */
  public getViolationHistory(limit?: number): BudgetViolation[] {
    const violations = [...this.violations].reverse();
    return limit ? violations.slice(0, limit) : violations;
  }

  /**
   * Get report history
   */
  public getReportHistory(limit?: number): BudgetReport[] {
    const reports = [...this.reports].reverse();
    return limit ? reports.slice(0, limit) : reports;
  }

  /**
   * Clear violation history
   */
  public clearHistory(): void {
    this.violations = [];
    this.reports = [];
    logger.debug('📏 Budget history cleared', 'performance', {});
  }

  /**
   * Get budget status summary
   */
  public getStatusSummary(): {
    totalRules: number;
    activeRules: number;
    recentViolations: number;
    worstMetrics: Array<{
      metric: BudgetMetric;
      violationCount: number;
      averageExcess: number;
    }>;
  } {
    const activeRules = Array.from(this.rules.values()).filter(rule => rule.enabled);
    const recentViolations = this.violations.filter(
      v => Date.now() - v.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    // Calculate worst metrics
    const metricViolations = new Map<BudgetMetric, number[]>();
    recentViolations.forEach(violation => {
      const excess = violation.actualValue - violation.threshold;
      if (!metricViolations.has(violation.metric)) {
        metricViolations.set(violation.metric, []);
      }
      metricViolations.get(violation.metric)!.push(excess);
    });

    const worstMetrics = Array.from(metricViolations.entries())
      .map(([metric, excesses]) => ({
        metric,
        violationCount: excesses.length,
        averageExcess: excesses.reduce((sum, excess) => sum + excess, 0) / excesses.length,
      }))
      .sort((a, b) => b.violationCount - a.violationCount)
      .slice(0, 5);

    return {
      totalRules: this.rules.size,
      activeRules: activeRules.length,
      recentViolations: recentViolations.length,
      worstMetrics,
    };
  }
}

// Singleton instance
let budgetService: PerformanceBudgetService | null = null;

export function getBudgetService(): PerformanceBudgetService {
  if (!budgetService) {
    budgetService = new PerformanceBudgetService();
  }
  return budgetService;
}