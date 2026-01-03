/**
 * Device Detection and Performance Adaptation
 *
 * Detects device capabilities and adapts performance settings accordingly.
 * Helps the app run smoothly on low-end devices while leveraging high-end features.
 */

import { logger } from '@/utils/logger';

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

/** Navigator with Battery API */
interface NavigatorWithBattery extends Navigator {
  getBattery(): Promise<BatteryManager>;
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

/** Battery Manager API types */
interface BatteryManager {
  charging: boolean;
  level: number;
  chargingTime: number;
  dischargingTime: number;
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

export interface DeviceCapabilities {
  /** Device tier: low, medium, high */
  tier: 'low' | 'medium' | 'high';

  /** Estimated CPU cores */
  cores: number;

  /** Estimated RAM in GB */
  memory: number;

  /** GPU tier (based on rendering tests) */
  gpu: 'low' | 'medium' | 'high';

  /** Connection speed */
  connection: 'slow' | 'medium' | 'fast';

  /** Screen size category */
  screen: 'small' | 'medium' | 'large';

  /** Is touch device */
  touch: boolean;

  /** Supports modern features */
  modern: boolean;

  /** Battery saving mode */
  batterySaving: boolean;
}

export interface PerformanceSettings {
  /** Enable animations */
  animations: boolean;

  /** Use virtual scrolling for lists over this size */
  virtualScrollThreshold: number;

  /** Prefetch aggressiveness (0-1) */
  prefetchLevel: number;

  /** Image quality (0-1) */
  imageQuality: number;

  /** Enable blur effects */
  blurEffects: boolean;

  /** Enable shadows */
  shadows: boolean;

  /** Debounce time for inputs (ms) */
  debounceTime: number;

  /** Throttle time for scroll (ms) */
  throttleTime: number;

  /** Max concurrent network requests */
  maxConcurrentRequests: number;
}

let cachedCapabilities: DeviceCapabilities | null = null;
let performanceSettings: PerformanceSettings | null = null;

/**
 * Detect device capabilities
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as NavigatorWithDeviceMemory).deviceMemory || estimateMemory();
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
  let tier: 'low' | 'medium' | 'high';
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
 * Get performance settings based on device capabilities
 * Auto-detects optimal settings based on device tier
 */
export async function getPerformanceSettings(): Promise<PerformanceSettings> {
  if (performanceSettings) {
    return performanceSettings;
  }

  const capabilities = await detectDeviceCapabilities();
  const effectiveTier = capabilities.tier;

  // Default settings for high-end devices
  let settings: PerformanceSettings = {
    animations: true,
    virtualScrollThreshold: 50,
    prefetchLevel: 1,
    imageQuality: 1,
    blurEffects: true,
    shadows: true,
    debounceTime: 150,
    throttleTime: 16, // 60fps
    maxConcurrentRequests: 6,
  };

  // Adjust for medium-tier devices
  if (effectiveTier === 'medium') {
    settings = {
      ...settings,
      virtualScrollThreshold: 30,
      prefetchLevel: 0.7,
      imageQuality: 0.85,
      blurEffects: false,
      debounceTime: 200,
      throttleTime: 33, // 30fps
      maxConcurrentRequests: 4,
    };
  }

  // Adjust for low-end devices
  if (effectiveTier === 'low') {
    settings = {
      ...settings,
      animations: !capabilities.batterySaving,
      virtualScrollThreshold: 20,
      prefetchLevel: 0.3,
      imageQuality: 0.7,
      blurEffects: false,
      shadows: false,
      debounceTime: 300,
      throttleTime: 66, // 15fps
      maxConcurrentRequests: 2,
    };
  }

  // Override if battery saving
  if (capabilities.batterySaving) {
    settings.animations = false;
    settings.blurEffects = false;
    settings.shadows = false;
  }

  performanceSettings = settings;
  return settings;
}

/**
 * Estimate memory (fallback for older browsers)
 */
function estimateMemory(): number {
  // Use performance API to estimate
  const perfWithMemory = performance as PerformanceWithMemory;
  if (perfWithMemory.memory) {
    const jsHeapLimit = perfWithMemory.memory.jsHeapSizeLimit;
    // Rough estimate: total memory is ~4x JS heap limit
    return Math.round((jsHeapLimit / 1024 / 1024 / 1024) * 4);
  }

  // Very rough estimate based on user agent
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('tablet')) {
    return 2; // Assume 2GB for mobile
  }
  return 4; // Assume 4GB for desktop
}

/**
 * Detect connection speed
 */
function detectConnection(): 'slow' | 'medium' | 'fast' {
  const navWithConn = navigator as NavigatorWithConnection;
  const conn = navWithConn.connection || navWithConn.mozConnection || navWithConn.webkitConnection;

  if (!conn) return 'medium';

  const effectiveType = conn.effectiveType;

  if (effectiveType === '4g') return 'fast';
  if (effectiveType === '3g') return 'medium';
  return 'slow';
}

/**
 * Detect GPU tier via rendering test
 */
async function detectGPU(): Promise<'low' | 'medium' | 'high'> {
  try {
    // Try to get GPU info from WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;

    if (!gl) return 'low';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as WebGLDebugRendererInfo | null;
    if (!debugInfo) return 'medium';

    const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string).toLowerCase();

    // High-end GPUs
    if (
      renderer.includes('apple') ||
      renderer.includes('nvidia') ||
      renderer.includes('amd') ||
      renderer.includes('radeon') ||
      renderer.includes('geforce')
    ) {
      return 'high';
    }

    // Low-end integrated GPUs
    if (
      renderer.includes('intel hd') ||
      renderer.includes('mali-4') ||
      renderer.includes('adreno 3')
    ) {
      return 'low';
    }

    return 'medium';
  } catch (_error) {
    return 'medium';
  }
}

/**
 * Detect screen size category
 */
function detectScreenSize(): 'small' | 'medium' | 'large' {
  const width = window.innerWidth;

  if (width < 640) return 'small';
  if (width < 1024) return 'medium';
  return 'large';
}

/**
 * Check if device is touch-enabled
 */
function isTouchDevice(): boolean {
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
  return !!(
    typeof window.IntersectionObserver !== 'undefined' &&
    typeof window.requestIdleCallback !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    typeof CSS !== 'undefined' && CSS.supports &&
    CSS.supports('display', 'grid')
  );
}

/**
 * Check if battery saving mode is enabled
 */
function isBatterySaving(): boolean {
  // Check reduced motion preference (often enabled in battery saving)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Check battery API if available
  if ('getBattery' in navigator) {
    (navigator as NavigatorWithBattery).getBattery().then((battery) => {
      return battery.charging === false && battery.level < 0.2;
    });
  }

  return reducedMotion;
}

/**
 * Reset cached values (useful for testing)
 */
export function resetDeviceDetection(): void {
  cachedCapabilities = null;
  performanceSettings = null;
}

/**
 * Override performance settings (for user preferences)
 */
export function setPerformanceOverrides(overrides: Partial<PerformanceSettings>): void {
  performanceSettings = {
    ...performanceSettings!,
    ...overrides,
  };

  // Save to localStorage
  localStorage.setItem('myK9Q_perf_overrides', JSON.stringify(overrides));
}

/**
 * Load performance overrides from localStorage
 */
export function loadPerformanceOverrides(): Partial<PerformanceSettings> | null {
  const stored = localStorage.getItem('myK9Q_perf_overrides');
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Apply CSS classes based on device tier
 */
export async function applyDeviceClasses(): Promise<void> {
  const capabilities = await detectDeviceCapabilities();
  const settings = await getPerformanceSettings();

  document.documentElement.classList.add(`device-tier-${capabilities.tier}`);
  document.documentElement.classList.add(`device-gpu-${capabilities.gpu}`);

  if (!settings.animations) {
    document.documentElement.classList.add('no-animations');
  }

  if (!settings.blurEffects) {
    document.documentElement.classList.add('no-blur');
  }

  if (!settings.shadows) {
    document.documentElement.classList.add('no-shadows');
  }

  if (capabilities.touch) {
    document.documentElement.classList.add('touch-device');
  }
}

/**
 * Get user's performance mode from settings
 * Returns null if set to 'auto', otherwise returns the manual tier
 */
function getUserPerformanceMode(): 'low' | 'medium' | 'high' | null {
  try {
    const settingsStr = localStorage.getItem('myK9Q_settings');
    if (!settingsStr) return null;

    const stored = JSON.parse(settingsStr);
    const settings = stored?.state?.settings;

    if (!settings || settings.performanceMode === 'auto') {
      return null;
    }

    // Map performanceMode to tier
    return settings.performanceMode as 'low' | 'medium' | 'high';
  } catch {
    return null;
  }
}

/**
 * Get device tier, respecting user override
 */
export async function getDeviceTier(): Promise<'low' | 'medium' | 'high'> {
  const userMode = getUserPerformanceMode();
  if (userMode) {
    return userMode;
  }

  const capabilities = await detectDeviceCapabilities();
  return capabilities.tier;
}

/**
 * Monitor performance and adjust dynamically
 */
export function startPerformanceMonitoring(): () => void {
  let rafId: number;
  let lastTime = performance.now();
  let frameCount = 0;
  let fps = 60;
  let lowFpsOptimized = false; // Track if we've already optimized

  // Check if user has already been shown the optimization dialog
  const hasOptimized = localStorage.getItem('myK9Q_fps_optimized') === 'true';
  if (hasOptimized) {
    lowFpsOptimized = true;
  }

  const checkPerformance = (currentTime: number) => {
    frameCount++;

    if (currentTime >= lastTime + 1000) {
      fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
      frameCount = 0;
      lastTime = currentTime;

      // If FPS drops below 20, switch to low-performance mode
      // Only show warning once per session
      if (fps < 20 && performanceSettings && performanceSettings.animations && !lowFpsOptimized) {
        logger.warn('Low FPS detected, reducing performance settings');
        setPerformanceOverrides({
          animations: false,
          blurEffects: false,
          shadows: false,
        });

        // Mark as optimized to prevent repeated warnings
        lowFpsOptimized = true;
        localStorage.setItem('myK9Q_fps_optimized', 'true');
      }
    }

    rafId = requestAnimationFrame(checkPerformance);
  };

  rafId = requestAnimationFrame(checkPerformance);

  // Return cleanup function
  return () => {
    cancelAnimationFrame(rafId);
  };
}
