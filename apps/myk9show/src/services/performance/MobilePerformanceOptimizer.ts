/**
 * Mobile Performance Optimizer
 *
 * This file re-exports from the modular mobile performance implementation.
 * @see ./mobile/ for the actual implementation.
 */

export {
  // Types
  type MobileOptimizationConfig,
  type NetworkCondition,
  type DeviceCapability,
  type MobileOptimization,
  type OptimizationStatus,
  DEFAULT_CONFIG,

  // Main exports used by consumers
  MobilePerformanceOptimizer,
  getMobilePerformanceOptimizer,
  initializeMobilePerformanceOptimization,

  // Device and network detection
  detectDeviceCapabilities,
  detectNetworkConditions,

  // Individual optimizations (for advanced use)
  applyAdaptiveImageLoading,
  applyReducedAnimation,
  applyDataSaverMode,
  applyBatteryOptimization,
  applyMemoryOptimization,
  applyTouchOptimization,
  applyNetworkAwareLoading,
  applyMobileSpecificCaching,
} from './mobile';
