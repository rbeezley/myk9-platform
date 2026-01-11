/**
 * Browser API Types
 *
 * Strict types for non-standard browser APIs used throughout the app.
 * These APIs may not be available in all browsers.
 */

/**
 * Network Information API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
 */
export interface NetworkInformation extends EventTarget {
  /** Effective connection type: slow-2g, 2g, 3g, 4g */
  readonly effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  /** Estimated downlink speed in Mbps */
  readonly downlink: number;
  /** Estimated round-trip time in milliseconds */
  readonly rtt: number;
  /** Whether data saver mode is enabled */
  readonly saveData: boolean;
  /** Connection type (if available) */
  readonly type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
  /** Downlink max in Mbps (if available) */
  readonly downlinkMax?: number;
  /** Event handler for connection changes */
  onchange: ((this: NetworkInformation, ev: Event) => void) | null;
}

/**
 * Battery Manager API
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BatteryManager
 */
export interface BatteryManager extends EventTarget {
  /** Whether the device is charging */
  readonly charging: boolean;
  /** Time in seconds until the battery is fully charged (Infinity if not charging) */
  readonly chargingTime: number;
  /** Time in seconds until the battery is fully discharged (Infinity if charging) */
  readonly dischargingTime: number;
  /** Battery level between 0 and 1 */
  readonly level: number;
  /** Event handlers */
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null;
  onchargingtimechange: ((this: BatteryManager, ev: Event) => void) | null;
  ondischargingtimechange: ((this: BatteryManager, ev: Event) => void) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null;
}

/**
 * Performance Memory API (Chrome-specific)
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory
 */
export interface PerformanceMemory {
  /** Total heap size allocated to the JavaScript heap */
  readonly jsHeapSizeLimit: number;
  /** Total amount of heap used */
  readonly totalJSHeapSize: number;
  /** Currently active segment of JS heap */
  readonly usedJSHeapSize: number;
}

/**
 * Extended Navigator interface with non-standard APIs
 */
export interface NavigatorExtended extends Navigator {
  /** Device Memory API: RAM in GB (approximate) */
  readonly deviceMemory?: number;
  /** Network Information API */
  readonly connection?: NetworkInformation;
  /** Mozilla Network Information API (legacy) */
  readonly mozConnection?: NetworkInformation;
  /** WebKit Network Information API (legacy) */
  readonly webkitConnection?: NetworkInformation;
  /** Battery Status API */
  getBattery?: () => Promise<BatteryManager>;
}

/**
 * Extended Performance interface with Chrome-specific APIs
 */
export interface PerformanceExtended extends Performance {
  /** Memory usage information (Chrome only) */
  readonly memory?: PerformanceMemory;
}

/**
 * Extended Screen Orientation interface
 */
export interface ScreenOrientationExtended extends ScreenOrientation {
  /** Orientation angle in degrees */
  readonly angle: number;
  /** Orientation type */
  readonly type: OrientationType;
}

/**
 * Extended Window interface with global APIs
 */
export interface WindowExtended extends Window {
  /** Force garbage collection (Chrome DevTools only) */
  gc?: () => void;
}

/**
 * Type guard to check if navigator has Network Information API
 */
export function hasNetworkInformation(nav: Navigator): nav is NavigatorExtended & { connection: NetworkInformation } {
  return 'connection' in nav && nav.connection != null;
}

/**
 * Type guard to check if navigator has Device Memory API
 */
export function hasDeviceMemory(nav: Navigator): nav is NavigatorExtended & { deviceMemory: number } {
  return 'deviceMemory' in nav && typeof (nav as NavigatorExtended).deviceMemory === 'number';
}

/**
 * Type guard to check if navigator has Battery API
 */
export function hasBatteryAPI(nav: Navigator): nav is NavigatorExtended & { getBattery: () => Promise<BatteryManager> } {
  return 'getBattery' in nav && typeof (nav as NavigatorExtended).getBattery === 'function';
}

/**
 * Type guard to check if performance has memory info (Chrome)
 */
export function hasPerformanceMemory(perf: Performance): perf is PerformanceExtended & { memory: PerformanceMemory } {
  return 'memory' in perf && perf.memory != null;
}

/**
 * Get network connection with proper typing
 */
export function getNetworkConnection(nav: Navigator = navigator): NetworkInformation | null {
  const extended = nav as NavigatorExtended;
  return extended.connection || extended.mozConnection || extended.webkitConnection || null;
}

/**
 * Get device memory with fallback
 */
export function getDeviceMemory(nav: Navigator = navigator, fallback = 4): number {
  if (hasDeviceMemory(nav)) {
    return nav.deviceMemory;
  }
  return fallback;
}

/**
 * Get battery manager if available
 */
export async function getBatteryManager(nav: Navigator = navigator): Promise<BatteryManager | null> {
  if (hasBatteryAPI(nav)) {
    try {
      return await nav.getBattery();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get performance memory info if available
 */
export function getPerformanceMemory(perf: Performance = performance): PerformanceMemory | null {
  if (hasPerformanceMemory(perf)) {
    return perf.memory;
  }
  return null;
}
