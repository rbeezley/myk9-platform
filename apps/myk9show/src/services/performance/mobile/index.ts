/**
 * Mobile Performance Module
 *
 * Re-exports all mobile performance optimization components.
 */

// Types
export type {
  MobileOptimizationConfig,
  NetworkCondition,
  DeviceCapability,
  MobileOptimization,
  OptimizationStatus,
} from './types';

export { DEFAULT_CONFIG } from './types';

// Device detection
export {
  detectDeviceCapabilities,
  estimateMemory,
  isLowEndDevice,
  isHighEndDevice,
} from './DeviceCapabilityDetector';

// Network detection
export {
  detectNetworkConditions,
  isSlowNetwork,
  shouldApplyDataSaver,
  getMaxConcurrentRequests,
  getPrefetchDelay,
  setupNetworkChangeMonitoring,
} from './NetworkConditionDetector';

// Optimization strategies
export {
  getAdaptiveImageQuality,
  applyAdaptiveImageLoading,
  applyReducedAnimation,
  applyDataSaverMode,
  applyBatteryOptimization,
  applyAggressiveBatterySaving,
  removeAggressiveBatterySaving,
  monitorBatteryStatus,
  applyMemoryOptimization,
  triggerMemoryCleanup,
  applyTouchOptimization,
  applyNetworkAwareLoading,
  applyMobileSpecificCaching,
  createMobileOptimizations,
} from './OptimizationStrategies';

// Main optimizer
export {
  MobilePerformanceOptimizer,
  getMobilePerformanceOptimizer,
  initializeMobilePerformanceOptimization,
} from './MobilePerformanceOptimizer';
