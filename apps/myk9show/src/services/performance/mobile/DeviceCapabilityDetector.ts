/**
 * Device Capability Detector
 *
 * Detects device capabilities for mobile optimization decisions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeviceCapability } from './types';

/**
 * Detect device capabilities
 */
export function detectDeviceCapabilities(): DeviceCapability {
  // Check if navigator is available (for SSR compatibility)
  if (typeof navigator === 'undefined') {
    return {
      isMobile: false,
      isTablet: false,
      memoryGB: 4,
      cpuCores: 4,
      screenDensity: 1,
      hasTouch: false,
    };
  }

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTablet = /(iPad|tablet|playbook|silk)|(android(?!.*mobile))/i.test(navigator.userAgent);

  // Estimate device capabilities
  const memoryGB = estimateMemory();
  const cpuCores = navigator.hardwareConcurrency || 4;
  const screenDensity = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const hasTouch = typeof window !== 'undefined' ? ('ontouchstart' in window) : false;

  return {
    isMobile,
    isTablet,
    memoryGB,
    cpuCores,
    screenDensity,
    hasTouch,
  };
}

/**
 * Estimate device memory
 */
export function estimateMemory(): number {
  // Use Device Memory API if available
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    return (navigator as any).deviceMemory;
  }

  // Fallback estimation based on other factors
  if (typeof screen === 'undefined' || typeof window === 'undefined') {
    return 2; // Default to 2GB
  }

  const width = screen.width;
  const height = screen.height;
  const pixelRatio = window.devicePixelRatio || 1;

  // Simple heuristic based on screen resolution
  const totalPixels = width * height * pixelRatio;

  if (totalPixels > 2073600) return 8; // High-end device (>1080p)
  if (totalPixels > 921600) return 4;  // Mid-range device (>720p)
  if (totalPixels > 307200) return 2;  // Low-end device (>480p)
  return 1; // Very low-end device
}

/**
 * Check if the device is low-end based on capabilities
 */
export function isLowEndDevice(device: DeviceCapability): boolean {
  return device.memoryGB < 3 || device.cpuCores < 4;
}

/**
 * Check if the device is high-end based on capabilities
 */
export function isHighEndDevice(device: DeviceCapability): boolean {
  return device.memoryGB >= 6 && device.cpuCores >= 6;
}
