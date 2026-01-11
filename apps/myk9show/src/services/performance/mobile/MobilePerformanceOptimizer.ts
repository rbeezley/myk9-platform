/**
 * Mobile Performance Optimizer
 *
 * Orchestrates mobile-specific performance optimizations.
 * Specialized optimizations for mobile devices and 3G networks:
 * - Dogs page: 3.5s → <3s target
 * - Shows page: Slow → <3s target
 * - Network-aware loading strategies
 * - Battery and data usage optimization
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  MobileOptimizationConfig,
  NetworkCondition,
  DeviceCapability,
  MobileOptimization,
  OptimizationStatus,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { detectDeviceCapabilities } from './DeviceCapabilityDetector';
import { detectNetworkConditions, setupNetworkChangeMonitoring } from './NetworkConditionDetector';
import { createMobileOptimizations } from './OptimizationStrategies';
import { getRumService } from '../RealUserMonitoring';
import { logger } from '@/services/LoggingService';

export class MobilePerformanceOptimizer {
  private config: MobileOptimizationConfig;
  private device: DeviceCapability;
  private network: NetworkCondition;
  private optimizations: MobileOptimization[] = [];
  private appliedOptimizations: Set<string> = new Set();
  private rumService = getRumService();
  private cleanupNetworkMonitoring: () => void = () => {};

  constructor(config?: Partial<MobileOptimizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.device = detectDeviceCapabilities();
    this.network = detectNetworkConditions();
    this.optimizations = createMobileOptimizations(this.device, this.config);
  }

  /**
   * Initialize mobile performance optimization
   */
  public async initialize(): Promise<void> {
    logger.info('Initializing Mobile Performance Optimizer', 'mobile');

    // Start device and network monitoring
    this.startDeviceMonitoring();
    this.startNetworkMonitoring();

    // Apply initial optimizations
    await this.applyMobileOptimizations();

    // Set up adaptive optimization
    this.setupAdaptiveOptimization();
  }

  /**
   * Apply mobile optimizations based on device and network conditions
   */
  private async applyMobileOptimizations(): Promise<void> {
    for (const optimization of this.optimizations) {
      if (optimization.condition(this.device, this.network)) {
        try {
          logger.debug('Applying mobile optimization', 'mobile', { name: optimization.name });
          await optimization.apply();
          this.appliedOptimizations.add(optimization.name);

          // Track optimization impact
          this.rumService.trackCustomMetric('mobile_optimization_applied', 1, {
            name: optimization.name,
            expected_load_time_improvement: optimization.impact.loadTime.toString(),
            expected_data_reduction: optimization.impact.dataUsage.toString(),
            expected_battery_improvement: optimization.impact.batteryLife.toString(),
          });
        } catch (error) {
          logger.error('Failed to apply mobile optimization', 'mobile', { name: optimization.name }, error as Error);
        }
      }
    }
  }

  /**
   * Start device monitoring
   */
  private startDeviceMonitoring(): void {
    // Monitor device orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.rumService.trackCustomMetric('orientation_change', 1, {
          orientation: screen.orientation?.angle.toString() || 'unknown',
        });
      }, 100);
    });

    // Monitor page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.reduceBackgroundActivity();
      } else {
        this.resumeNormalActivity();
      }
    });
  }

  /**
   * Reduce background activity
   */
  private reduceBackgroundActivity(): void {
    (window as any).mobileBackgroundMode = true;
    this.rumService.trackCustomMetric('background_mode_activated', 1);
  }

  /**
   * Resume normal activity
   */
  private resumeNormalActivity(): void {
    (window as any).mobileBackgroundMode = false;
    this.rumService.trackCustomMetric('foreground_mode_activated', 1);
  }

  /**
   * Start network monitoring
   */
  private startNetworkMonitoring(): void {
    this.cleanupNetworkMonitoring = setupNetworkChangeMonitoring((newNetwork, oldNetwork) => {
      logger.debug('Network conditions changed', 'mobile', { network: newNetwork });

      // Detect significant network changes
      if (newNetwork.effectiveType !== oldNetwork.effectiveType) {
        this.handleNetworkQualityChange(oldNetwork.effectiveType, newNetwork.effectiveType);
      }

      this.network = newNetwork;
    });
  }

  /**
   * Handle network quality changes
   */
  private handleNetworkQualityChange(oldType: string, newType: string): void {
    logger.info('Network quality changed', 'mobile', { from: oldType, to: newType });

    this.rumService.trackCustomMetric('network_quality_change', 1, {
      from: oldType,
      to: newType,
    });

    // Reapply optimizations based on new network conditions
    this.applyMobileOptimizations();
  }

  /**
   * Set up adaptive optimization
   */
  private setupAdaptiveOptimization(): void {
    // Continuously monitor and adapt optimizations
    setInterval(() => {
      this.adaptOptimizations();
    }, 60000); // Check every minute
  }

  /**
   * Adapt optimizations based on current conditions
   */
  private adaptOptimizations(): void {
    const currentNetwork = detectNetworkConditions();
    const performanceMetrics = this.rumService.getPerformanceSummary();

    // Check if optimizations need adjustment
    const needsReoptimization =
      currentNetwork.effectiveType !== this.network.effectiveType ||
      performanceMetrics.vitals.LCP > 3000 ||
      performanceMetrics.vitals.CLS > 0.1;

    if (needsReoptimization) {
      logger.debug('Adapting mobile optimizations', 'mobile');
      this.network = currentNetwork;
      this.applyMobileOptimizations();
    }
  }

  /**
   * Get optimization status
   */
  public getOptimizationStatus(): OptimizationStatus {
    const expectedImprovements = Array.from(this.appliedOptimizations)
      .map(name => this.optimizations.find(opt => opt.name === name))
      .filter(Boolean)
      .reduce(
        (total, opt) => ({
          loadTime: total.loadTime + opt!.impact.loadTime,
          dataUsage: total.dataUsage + opt!.impact.dataUsage,
          batteryLife: total.batteryLife + opt!.impact.batteryLife,
        }),
        { loadTime: 0, dataUsage: 0, batteryLife: 0 }
      );

    return {
      device: this.device,
      network: this.network,
      appliedOptimizations: Array.from(this.appliedOptimizations),
      expectedImprovements,
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Clean up network monitoring
    this.cleanupNetworkMonitoring();

    // Clean up workers
    const worker = (window as any).mobileOptimizationWorker;
    if (worker) {
      worker.terminate();
      delete (window as any).mobileOptimizationWorker;
    }

    // Clean up service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          if (registration.scope.includes('mobile-performance')) {
            registration.unregister();
          }
        });
      });
    }
  }
}

// Singleton instance
let mobilePerformanceOptimizer: MobilePerformanceOptimizer | null = null;

export function getMobilePerformanceOptimizer(config?: Partial<MobileOptimizationConfig>): MobilePerformanceOptimizer {
  if (!mobilePerformanceOptimizer) {
    mobilePerformanceOptimizer = new MobilePerformanceOptimizer(config);
  }
  return mobilePerformanceOptimizer;
}

/**
 * Initialize mobile performance optimization
 */
export async function initializeMobilePerformanceOptimization(config?: Partial<MobileOptimizationConfig>): Promise<void> {
  const optimizer = getMobilePerformanceOptimizer(config);
  await optimizer.initialize();
}
