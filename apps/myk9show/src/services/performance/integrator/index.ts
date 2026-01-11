/**
 * Performance Integrator Module
 *
 * Coordinates all performance optimization services.
 */

export * from './types';
export * from './OptimizationImplementations';
export * from './PerformanceMonitoring';
export {
  PerformanceIntegrator,
  getPerformanceIntegrator,
  initializePerformanceOptimization,
} from './PerformanceIntegrator';
