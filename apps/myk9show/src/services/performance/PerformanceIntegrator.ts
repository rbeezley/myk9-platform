/**
 * Performance Integrator Service
 *
 * Re-exports from the modular integrator structure for backward compatibility.
 *
 * @see ./integrator/PerformanceIntegrator.ts for the main implementation
 */

export {
  PerformanceIntegrator,
  getPerformanceIntegrator,
  initializePerformanceOptimization,
} from './integrator/PerformanceIntegrator';

export type {
  PerformanceTargets,
  PerformanceMetrics,
  OptimizationPlan,
  OptimizationStep,
} from './integrator/types';
