/**
 * Performance Integrator Service
 *
 * Coordinates all performance optimization services to achieve target metrics:
 * - LCP: 3.1s → <2.5s target (-600ms improvement)
 * - Bundle Size: Current → <500KB initial target
 * - Mobile: 3.5s → <3s target on Dogs/Shows pages
 * - FID: <100ms, CLS: <0.1 maintained
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { initializeCoreWebVitalsOptimization, getCoreWebVitalsOptimizer } from '../CoreWebVitalsOptimizer';
import { initializeBundleOptimization, getBundleOptimizer } from '../BundleOptimizer';
import { initializeMobilePerformanceOptimization, getMobilePerformanceOptimizer, MobileOptimizationConfig } from '../MobilePerformanceOptimizer';
import { initializeRUM, getRumService } from '../RealUserMonitoring';

import {
  PerformanceTargets,
  PerformanceMetrics,
  OptimizationPlan,
  OptimizationStep,
  DEFAULT_TARGETS,
  DEFAULT_BASELINE,
} from './types';
import {
  ImageOptimization,
  FontOptimization,
  ResourcePrioritization,
  NetworkOptimization,
} from './OptimizationImplementations';
import {
  getCurrentBundleSize,
  PerformanceRegressionChecker,
  PerformanceBudgetMonitor,
  UXMonitor,
  PerformanceMetricsCalculator,
} from './PerformanceMonitoring';

// Re-export types
export type { PerformanceTargets, PerformanceMetrics, OptimizationPlan, OptimizationStep };

export class PerformanceIntegrator {
  private static instance: PerformanceIntegrator | null = null;

  private targets: PerformanceTargets = { ...DEFAULT_TARGETS };
  private currentMetrics: PerformanceTargets = { ...DEFAULT_BASELINE };

  private optimizationPlan: OptimizationPlan = {
    phase: 'initialization',
    currentStep: 'Starting performance analysis',
    totalSteps: 12,
    completedSteps: 0,
    estimatedTimeRemaining: 30,
    optimizations: [],
  };

  private isInitialized = false;
  private optimizationStartTime = 0;
  private callbacks: Set<(plan: OptimizationPlan) => void> = new Set();

  private regressionChecker: PerformanceRegressionChecker;
  private budgetMonitor: PerformanceBudgetMonitor;
  private uxMonitor: UXMonitor;
  private metricsCalculator: PerformanceMetricsCalculator;

  private constructor() {
    this.regressionChecker = new PerformanceRegressionChecker(this.targets);
    this.budgetMonitor = new PerformanceBudgetMonitor(this.targets);
    this.uxMonitor = new UXMonitor();
    this.metricsCalculator = new PerformanceMetricsCalculator(this.targets, this.currentMetrics);
    this.initializeOptimizationSteps();
  }

  public static getInstance(): PerformanceIntegrator {
    if (!PerformanceIntegrator.instance) {
      PerformanceIntegrator.instance = new PerformanceIntegrator();
    }
    return PerformanceIntegrator.instance;
  }

  /**
   * Initialize comprehensive performance optimization
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Performance integrator already initialized');
      return;
    }

    console.log('🚀 Starting comprehensive performance optimization');
    this.optimizationStartTime = Date.now();

    try {
      await this.executePhase1();
      await this.executePhase2();
      await this.executePhase3();
      await this.executePhase4();

      this.isInitialized = true;
      this.updateOptimizationPlan('complete', 'Performance optimization completed successfully');

      console.log('✅ Performance optimization completed');
      this.metricsCalculator.logFinalResults(this.optimizationStartTime);

    } catch (error) {
      console.error('❌ Performance optimization failed:', error);
      this.updateOptimizationPlan('initialization', `Optimization failed: ${error}`);
      throw error;
    }
  }

  private initializeOptimizationSteps(): void {
    this.optimizationPlan.optimizations = [
      { name: 'rum_initialization', description: 'Initialize Real User Monitoring', status: 'pending', impact: { lcp: 0 } },
      { name: 'baseline_measurement', description: 'Measure current performance baseline', status: 'pending', impact: { lcp: 0 } },
      { name: 'bundle_analysis', description: 'Analyze bundle composition and identify optimization opportunities', status: 'pending', impact: { bundleSize: 200 } },
      { name: 'core_web_vitals_optimization', description: 'Apply Core Web Vitals optimizations (LCP, CLS, FID)', status: 'pending', impact: { lcp: 800, cls: 0.03, fid: 30 } },
      { name: 'bundle_optimization', description: 'Optimize bundle size and loading strategies', status: 'pending', impact: { lcp: 400, bundleSize: 300 } },
      { name: 'mobile_optimization', description: 'Apply mobile-specific performance optimizations', status: 'pending', impact: { lcp: 600 } },
      { name: 'image_optimization', description: 'Optimize image loading and compression', status: 'pending', impact: { lcp: 300, bundleSize: 100 } },
      { name: 'font_optimization', description: 'Optimize font loading strategies', status: 'pending', impact: { lcp: 200 } },
      { name: 'resource_prioritization', description: 'Prioritize critical resources and defer non-critical ones', status: 'pending', impact: { lcp: 250 } },
      { name: 'network_optimization', description: 'Apply network-aware loading optimizations', status: 'pending', impact: { lcp: 200 } },
      { name: 'performance_monitoring', description: 'Set up continuous performance monitoring', status: 'pending', impact: { lcp: 0 } },
      { name: 'validation_testing', description: 'Validate optimization results and measure improvements', status: 'pending', impact: { lcp: 0 } },
    ];
  }

  private async executePhase1(): Promise<void> {
    this.updateOptimizationPlan('initialization', 'Initializing monitoring and analysis');

    await this.executeOptimizationStep('rum_initialization', async () => {
      initializeRUM();
      await this.wait(1000);
    });

    await this.executeOptimizationStep('baseline_measurement', async () => {
      await this.measureCurrentPerformance();
    });

    await this.executeOptimizationStep('bundle_analysis', async () => {
      const bundleOptimizer = getBundleOptimizer();
      await bundleOptimizer.analyzeBundles();
    });
  }

  private async executePhase2(): Promise<void> {
    this.updateOptimizationPlan('optimization', 'Applying core performance optimizations');

    await this.executeOptimizationStep('core_web_vitals_optimization', async () => {
      await initializeCoreWebVitalsOptimization();
    });

    await this.executeOptimizationStep('bundle_optimization', async () => {
      await initializeBundleOptimization();
    });

    await this.executeOptimizationStep('mobile_optimization', async () => {
      const mobileConfig: Partial<MobileOptimizationConfig> = {
        enableDataSaver: true,
        networkAwareLoading: true,
        batteryOptimization: true,
      };
      await initializeMobilePerformanceOptimization(mobileConfig);
    });
  }

  private async executePhase3(): Promise<void> {
    this.updateOptimizationPlan('optimization', 'Applying advanced optimizations');

    await this.executeOptimizationStep('image_optimization', async () => {
      ImageOptimization.optimize();
    });

    await this.executeOptimizationStep('font_optimization', async () => {
      FontOptimization.optimize();
    });

    await this.executeOptimizationStep('resource_prioritization', async () => {
      ResourcePrioritization.optimize();
    });

    await this.executeOptimizationStep('network_optimization', async () => {
      NetworkOptimization.optimize();
    });
  }

  private async executePhase4(): Promise<void> {
    this.updateOptimizationPlan('monitoring', 'Setting up monitoring and validation');

    await this.executeOptimizationStep('performance_monitoring', async () => {
      setInterval(() => this.regressionChecker.check(), 60000);
      this.budgetMonitor.start();
      this.uxMonitor.start();
    });

    await this.executeOptimizationStep('validation_testing', async () => {
      await this.validateOptimizations();
    });
  }

  private async executeOptimizationStep(stepName: string, execution: () => Promise<void>): Promise<void> {
    const step = this.optimizationPlan.optimizations.find(opt => opt.name === stepName);
    if (!step) {
      throw new Error(`Optimization step not found: ${stepName}`);
    }

    try {
      step.status = 'running';
      step.startTime = Date.now();
      this.updateOptimizationPlan(this.optimizationPlan.phase, `Executing: ${step.description}`);

      await execution();

      step.status = 'completed';
      step.endTime = Date.now();
      this.optimizationPlan.completedSteps++;

      const avgTimePerStep = (Date.now() - this.optimizationStartTime) / this.optimizationPlan.completedSteps;
      const remainingSteps = this.optimizationPlan.totalSteps - this.optimizationPlan.completedSteps;
      this.optimizationPlan.estimatedTimeRemaining = Math.round((avgTimePerStep * remainingSteps) / 1000);

      console.log(`✅ Completed: ${step.description}`);
      this.notifyCallbacks();

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed: ${step.description}`, error);
      throw error;
    }
  }

  private async measureCurrentPerformance(): Promise<void> {
    const rumService = getRumService();
    await this.wait(3000);

    const performanceData = rumService.getPerformanceSummary();

    if (performanceData.vitals.LCP) {
      this.currentMetrics.lcp = performanceData.vitals.LCP;
    }
    if (performanceData.vitals.FID) {
      this.currentMetrics.fid = performanceData.vitals.FID;
    }
    if (performanceData.vitals.CLS) {
      this.currentMetrics.cls = performanceData.vitals.CLS;
    }
    if (performanceData.vitals.TTFB) {
      this.currentMetrics.ttfb = performanceData.vitals.TTFB;
    }

    this.currentMetrics.bundleSize = getCurrentBundleSize();

    console.log('📊 Current performance baseline:', this.currentMetrics);
  }

  private async validateOptimizations(): Promise<void> {
    console.log('🔍 Validating optimization results...');
    await this.wait(5000);

    const rumService = getRumService();
    const finalMetrics = rumService.getPerformanceSummary();

    const improvements = this.metricsCalculator.calculateImprovements(finalMetrics);
    const validationResults = this.metricsCalculator.validateAgainstTargets(finalMetrics);

    console.log('📊 Optimization Results:');
    console.log('Improvements:', improvements);
    console.log('Target Validation:', validationResults);

    rumService.trackCustomMetric('optimization_validation_completed', 1, {
      lcp_improvement: improvements.lcp.toString(),
      bundle_size_improvement: improvements.bundleSize.toString(),
      targets_met: validationResults.targetsMet.toString(),
    });
  }

  public subscribe(callback: (plan: OptimizationPlan) => void): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public getOptimizationPlan(): OptimizationPlan {
    return { ...this.optimizationPlan };
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    const rumService = getRumService();
    const currentData = rumService.getPerformanceSummary();

    const current: PerformanceTargets = {
      lcp: currentData.vitals.LCP || this.currentMetrics.lcp,
      fid: currentData.vitals.FID || this.currentMetrics.fid,
      cls: currentData.vitals.CLS || this.currentMetrics.cls,
      ttfb: currentData.vitals.TTFB || this.currentMetrics.ttfb,
      bundleSize: getCurrentBundleSize(),
      mobileLcp: this.currentMetrics.mobileLcp,
    };

    const improvement: PerformanceTargets = {
      lcp: Math.max(0, this.currentMetrics.lcp - current.lcp),
      fid: Math.max(0, this.currentMetrics.fid - current.fid),
      cls: Math.max(0, this.currentMetrics.cls - current.cls),
      ttfb: Math.max(0, this.currentMetrics.ttfb - current.ttfb),
      bundleSize: Math.max(0, this.currentMetrics.bundleSize - current.bundleSize),
      mobileLcp: Math.max(0, this.currentMetrics.mobileLcp - current.mobileLcp),
    };

    const score = this.metricsCalculator.calculateScore(current);

    return {
      current,
      target: this.targets,
      improvement,
      score,
    };
  }

  private updateOptimizationPlan(phase: OptimizationPlan['phase'], currentStep: string): void {
    this.optimizationPlan.phase = phase;
    this.optimizationPlan.currentStep = currentStep;
    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.getOptimizationPlan());
      } catch (error) {
        console.error('Error in optimization plan callback:', error);
      }
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public cleanup(): void {
    this.callbacks.clear();
    this.budgetMonitor.stop();
    this.uxMonitor.stop();
    getCoreWebVitalsOptimizer().cleanup();
    getMobilePerformanceOptimizer().cleanup();
  }
}

export function getPerformanceIntegrator(): PerformanceIntegrator {
  return PerformanceIntegrator.getInstance();
}

export async function initializePerformanceOptimization(): Promise<void> {
  const integrator = getPerformanceIntegrator();
  await integrator.initialize();
}
