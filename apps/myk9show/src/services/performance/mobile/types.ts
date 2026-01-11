/**
 * Mobile Performance Types
 *
 * Shared types for mobile performance optimization.
 */

export interface MobileOptimizationConfig {
  enableDataSaver: boolean;
  reducedMotion: boolean;
  limitImageQuality: boolean;
  enableOfflineMode: boolean;
  batteryOptimization: boolean;
  networkAwareLoading: boolean;
}

export interface NetworkCondition {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink: number; // Mbps
  rtt: number; // ms
  saveData: boolean;
}

export interface DeviceCapability {
  isMobile: boolean;
  isTablet: boolean;
  memoryGB: number;
  cpuCores: number;
  screenDensity: number;
  hasTouch: boolean;
}

export interface MobileOptimization {
  name: string;
  condition: (device: DeviceCapability, network: NetworkCondition) => boolean;
  apply: () => Promise<void>;
  impact: {
    loadTime: number; // ms improvement
    dataUsage: number; // % reduction
    batteryLife: number; // % improvement
  };
}

export interface OptimizationStatus {
  device: DeviceCapability;
  network: NetworkCondition;
  appliedOptimizations: string[];
  expectedImprovements: {
    loadTime: number;
    dataUsage: number;
    batteryLife: number;
  };
}

export const DEFAULT_CONFIG: MobileOptimizationConfig = {
  enableDataSaver: true,
  reducedMotion: false,
  limitImageQuality: true,
  enableOfflineMode: true,
  batteryOptimization: true,
  networkAwareLoading: true,
};
