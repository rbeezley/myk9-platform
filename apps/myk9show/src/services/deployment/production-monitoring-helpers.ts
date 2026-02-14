/**
 * Production Monitoring Helpers
 *
 * Pure helper functions for device detection, ID generation,
 * and other utilities used by ProductionMonitoringService.
 */

import type { DeviceInfo } from './production-monitoring-types';

// === Device Detection ===

export function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  const userAgent = navigator.userAgent;
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return /iPad/i.test(userAgent) ? 'tablet' : 'mobile';
  }
  return 'desktop';
}

export function detectOS(): string {
  const userAgent = navigator.userAgent;
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  return 'Unknown';
}

export function detectBrowser(): string {
  const userAgent = navigator.userAgent;
  if (/Chrome/i.test(userAgent)) return 'Chrome';
  if (/Firefox/i.test(userAgent)) return 'Firefox';
  if (/Safari/i.test(userAgent)) return 'Safari';
  if (/Edge/i.test(userAgent)) return 'Edge';
  return 'Unknown';
}

export function detectBrowserVersion(): string {
  // Simplified browser version detection
  return '1.0.0';
}

export function getDeviceInfo(): DeviceInfo {
  return {
    type: detectDeviceType(),
    os: detectOS(),
    browser: detectBrowser(),
    version: detectBrowserVersion(),
    screen: {
      width: window.screen.width,
      height: window.screen.height
    }
  };
}

// === URL Parsing ===

export function parseUTMParameters(): { source?: string; medium?: string; campaign?: string } {
  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('utm_source') ?? undefined;
  const medium = urlParams.get('utm_medium') ?? undefined;
  const campaign = urlParams.get('utm_campaign') ?? undefined;

  return {
    ...(source !== undefined && { source }),
    ...(medium !== undefined && { medium }),
    ...(campaign !== undefined && { campaign }),
  };
}

// === Metric Utilities ===

export function getMetricUnit(name: string): string {
  if (name.includes('time') || name.includes('duration')) return 'ms';
  if (name.includes('size') || name.includes('bytes')) return 'bytes';
  if (name.includes('rate') || name.includes('percentage')) return '%';
  return 'count';
}

// === ID Generation ===

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateErrorFingerprint(error: Error): string {
  // Create a fingerprint based on error message and stack trace
  const content = `${error.name}:${error.message}:${error.stack?.split('\n')[1] || ''}`;
  return btoa(content).substr(0, 16);
}
