/**
 * Device Detection and Performance Adaptation
 *
 * Detects device capabilities and adapts performance settings accordingly.
 * Helps the app run smoothly on low-end devices while leveraging high-end features.
 */

// Type definitions for non-standard browser APIs

/** Navigator with deviceMemory property (Chrome only) */
interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

/** Navigator with Network Information API */
interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

/** Navigator with MS Touch Points (legacy IE/Edge) */
interface NavigatorWithMsTouch extends Navigator {
  msMaxTouchPoints?: number;
}

/** Network Information API types */
interface NetworkInformation {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

/** Performance with Chrome memory API */
interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

/** WebGL with debug renderer info */
interface WebGLDebugRendererInfo {
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

export type DeviceTier = 'low' | 'medium' | 'high';
export type ConnectionSpeed = 'slow' | 'medium' | 'fast';
export type ScreenSize = 'small' | 'medium' | 'large';

export interface DeviceCapabilities {
  /** Device tier: low, medium, high */
  tier: DeviceTier;
  /** Estimated CPU cores */
  cores: number;
  /** Estimated RAM in GB */
  memory: number;
  /** GPU tier (based on rendering tests) */
  gpu: DeviceTier;
  /** Connection speed */
  connection: ConnectionSpeed;
  /** Screen size category */
  screen: ScreenSize;
  /** Is touch device */
  touch: boolean;
  /** Supports modern features */
  modern: boolean;
  /** Battery saving mode detected */
  batterySaving: boolean;
}

let cachedCapabilities: DeviceCapabilities | null = null;

/**
 * Estimate memory (fallback for older browsers)
 */
function estimateMemory(): number {
  if (typeof window === 'undefined') return 4;

  const perfWithMemory = performance as PerformanceWithMemory;
  if (perfWithMemory.memory) {
    const jsHeapLimit = perfWithMemory.memory.jsHeapSizeLimit;
    return Math.round((jsHeapLimit / 1024 / 1024 / 1024) * 4);
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('tablet')) {
    return 2;
  }
  return 4;
}

/**
 * Detect connection speed
 */
function detectConnection(): ConnectionSpeed {
  if (typeof navigator === 'undefined') return 'medium';

  const navWithConn = navigator as NavigatorWithConnection;
  const conn = navWithConn.connection || navWithConn.mozConnection || navWithConn.webkitConnection;

  if (!conn) return 'medium';

  const effectiveType = conn.effectiveType;
  if (effectiveType === '4g') return 'fast';
  if (effectiveType === '3g') return 'medium';
  return 'slow';
}

/**
 * Detect GPU tier via WebGL
 */
async function detectGPU(): Promise<DeviceTier> {
  if (typeof document === 'undefined') return 'medium';

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;

    if (!gl) return 'low';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as WebGLDebugRendererInfo | null;
    if (!debugInfo) return 'medium';

    const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string).toLowerCase();

    if (
      renderer.includes('apple') ||
      renderer.includes('nvidia') ||
      renderer.includes('amd') ||
      renderer.includes('radeon') ||
      renderer.includes('geforce')
    ) {
      return 'high';
    }

    if (
      renderer.includes('intel hd') ||
      renderer.includes('mali-4') ||
      renderer.includes('adreno 3')
    ) {
      return 'low';
    }

    return 'medium';
  } catch {
    return 'medium';
  }
}

/**
 * Detect screen size category
 */
function detectScreenSize(): ScreenSize {
  if (typeof window === 'undefined') return 'medium';

  const width = window.innerWidth;
  if (width < 640) return 'small';
  if (width < 1024) return 'medium';
  return 'large';
}

/**
 * Check if device is touch-enabled
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    ((navigator as NavigatorWithMsTouch).msMaxTouchPoints ?? 0) > 0
  );
}

/**
 * Check if browser supports modern features
 */
function hasModernFeatures(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;

  return !!(
    typeof window.IntersectionObserver !== 'undefined' &&
    typeof window.requestIdleCallback !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    CSS.supports &&
    CSS.supports('display', 'grid')
  );
}

/**
 * Check if battery saving mode is enabled
 */
function isBatterySaving(): boolean {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detect device capabilities
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const memory = typeof navigator !== 'undefined'
    ? (navigator as NavigatorWithDeviceMemory).deviceMemory || estimateMemory()
    : 4;
  const connection = detectConnection();
  const gpu = await detectGPU();
  const screen = detectScreenSize();
  const touch = isTouchDevice();
  const modern = hasModernFeatures();
  const batterySaving = isBatterySaving();

  // Calculate tier based on multiple factors
  let score = 0;

  // CPU score (0-30)
  if (cores >= 8) score += 30;
  else if (cores >= 4) score += 20;
  else if (cores >= 2) score += 10;
  else score += 5;

  // Memory score (0-30)
  if (memory >= 8) score += 30;
  else if (memory >= 4) score += 20;
  else if (memory >= 2) score += 10;
  else score += 5;

  // GPU score (0-25)
  if (gpu === 'high') score += 25;
  else if (gpu === 'medium') score += 15;
  else score += 5;

  // Connection score (0-15)
  if (connection === 'fast') score += 15;
  else if (connection === 'medium') score += 10;
  else score += 5;

  // Determine tier
  let tier: DeviceTier;
  if (score >= 70) tier = 'high';
  else if (score >= 40) tier = 'medium';
  else tier = 'low';

  // Battery saving overrides to low
  if (batterySaving) {
    tier = 'low';
  }

  cachedCapabilities = {
    tier,
    cores,
    memory,
    gpu,
    connection,
    screen,
    touch,
    modern,
    batterySaving,
  };

  return cachedCapabilities;
}

/**
 * Get device tier, respecting user override from localStorage
 */
export async function getDeviceTier(storageKey?: string): Promise<DeviceTier> {
  // Check for user override in localStorage
  if (storageKey && typeof localStorage !== 'undefined') {
    try {
      const settingsStr = localStorage.getItem(storageKey);
      if (settingsStr) {
        const stored = JSON.parse(settingsStr);
        const settings = stored?.state?.settings;

        if (settings && settings.performanceMode !== 'auto') {
          return settings.performanceMode as DeviceTier;
        }
      }
    } catch {
      // Fall through to detection
    }
  }

  const capabilities = await detectDeviceCapabilities();
  return capabilities.tier;
}

/**
 * Reset cached capabilities (useful for testing)
 */
export function resetDeviceDetection(): void {
  cachedCapabilities = null;
}
