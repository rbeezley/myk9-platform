/**
 * Performance Integrator Types
 *
 * Type definitions for the performance optimization system.
 */

export interface PerformanceTargets {
  lcp: number; // Largest Contentful Paint in ms
  fid: number; // First Input Delay in ms
  cls: number; // Cumulative Layout Shift score
  ttfb: number; // Time to First Byte in ms
  bundleSize: number; // Initial bundle size in KB
  mobileLcp: number; // LCP on mobile in ms
}

export interface PerformanceMetrics {
  current: PerformanceTargets;
  target: PerformanceTargets;
  improvement: PerformanceTargets;
  score: number; // Overall performance score 0-100
}

export interface OptimizationPlan {
  phase: 'initialization' | 'optimization' | 'monitoring' | 'complete';
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  estimatedTimeRemaining: number; // in seconds
  optimizations: OptimizationStep[];
}

export interface OptimizationStep {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  impact: {
    lcp?: number;
    fid?: number;
    cls?: number;
    bundleSize?: number;
  };
  startTime?: number;
  endTime?: number;
  error?: string;
}

export const DEFAULT_TARGETS: PerformanceTargets = {
  lcp: 2500,      // Target: <2.5s (current ~3.1s)
  fid: 100,       // Target: <100ms
  cls: 0.1,       // Target: <0.1
  ttfb: 600,      // Target: <600ms
  bundleSize: 500, // Target: <500KB initial
  mobileLcp: 3000, // Target: <3s on mobile (current ~3.5s)
};

export const DEFAULT_BASELINE: PerformanceTargets = {
  lcp: 3100,      // Current baseline
  fid: 80,        // Current baseline
  cls: 0.08,      // Current baseline
  ttfb: 800,      // Current baseline
  bundleSize: 0,  // Will be measured
  mobileLcp: 3500, // Current mobile baseline
};
