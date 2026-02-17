/**
 * Pure helper functions for RealUserMonitoringService
 */

import type {
  DeviceInfo,
  ConnectionInfo,
  NavigatorWithConnection,
  PerformanceWithMemory,
  PerformanceMemory,
} from './RealUserMonitoring.types';

// === ID Generation ===

export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2);
}

// === Navigation ===

export function getNavigationType(): string {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const types = ['navigate', 'reload', 'back_forward', 'prerender'];
  return types[(navigation?.type as unknown as number) || 0] || 'navigate';
}

// === Device Detection ===

export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = screen.width;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function getOS(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  return 'Unknown';
}

export function getBrowser(ua: string): string {
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

export function getBrowserVersion(ua: string): string {
  const match = ua.match(/(?:Chrome|Firefox|Safari|Edge)\/(\d+)/);
  return match ? match[1] : 'Unknown';
}

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  return {
    type: getDeviceType(),
    os: getOS(ua),
    browser: getBrowser(ua),
    version: getBrowserVersion(ua),
    screenResolution: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

// === Connection Detection ===

export function getConnectionInfo(): ConnectionInfo {
  const nav = navigator as NavigatorWithConnection;
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  return {
    effectiveType: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink || 0,
    rtt: connection?.rtt || 0,
    saveData: connection?.saveData || false,
  };
}

// === Memory Detection ===

export function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
}

export function getPerformanceMemory(): PerformanceMemory | null {
  const perfWithMemory = performance as PerformanceWithMemory;
  return perfWithMemory.memory ?? null;
}
