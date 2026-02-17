/**
 * Type definitions for RealUserMonitoringService
 */

/** LayoutShift entry -- not in standard PerformanceEntry types */
export interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

/** PerformanceEventTiming -- first-input entries */
export interface PerformanceEventTimingEntry extends PerformanceEntry {
  processingStart: number;
}

/** Long task entry with attribution */
export interface PerformanceLongTaskEntry extends PerformanceEntry {
  attribution?: Array<{ name: string }>;
}

/** Chrome-only performance.memory API */
export interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

/** Network Information API (experimental) */
export interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

export interface WebVital {
  name: 'FCP' | 'LCP' | 'CLS' | 'FID' | 'TTFB' | 'INP';
  value: number;
  delta: number;
  entries: PerformanceEntry[];
  id: string;
  navigationType?: string;
}

export interface CustomMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface UserSession {
  sessionId: string;
  userId?: string;
  startTime: number;
  endTime?: number;
  pageViews: number;
  totalTime: number;
  device: DeviceInfo;
  connection: ConnectionInfo;
  vitals: WebVital[];
  customMetrics: CustomMetric[];
  errors: ErrorInfo[];
}

export interface DeviceInfo {
  type: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  version: string;
  screenResolution: string;
  pixelRatio: number;
}

export interface ConnectionInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: number;
  userId?: string;
}

export interface PerformanceBudget {
  metric: string;
  threshold: number;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  value: number;
  threshold: number;
  severity: 'error' | 'warning' | 'info';
  timestamp: number;
  url: string;
  userId?: string;
  resolved: boolean;
}
