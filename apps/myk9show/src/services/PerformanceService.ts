import { auditService } from './AuditService';
import { AuditAction } from '@/types/audit-types';

export interface PerformanceMetrics {
  pageLoadTime: number;
  firstContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  largestContentfulPaint: number;
  timeToInteractive: number;
  resourceLoadTimes: ResourceTiming[];
  memoryUsage?: MemoryInfo;
  connectionInfo?: ConnectionInfo;
}

export interface ResourceTiming {
  name: string;
  type: string;
  duration: number;
  size: number;
  startTime: number;
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface ConnectionInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

interface PerformanceEntryWithValue extends PerformanceEntry {
  value?: number;
}

interface PerformanceEntryWithInput extends PerformanceEntry {
  processingStart?: number;
  hadRecentInput?: boolean;
}

interface BrowserMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface BrowserConnection {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export interface PerformanceBudget {
  pageLoadTime: number;
  firstContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  largestContentfulPaint: number;
  bundleSize: number;
  imageOptimization: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  metric: string;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
  context: Record<string, unknown>;
}

export class PerformanceService {
  private metrics: PerformanceMetrics[] = [];
  private budget: PerformanceBudget;
  private alerts: PerformanceAlert[] = [];
  private isMonitoring = false;
  private observers: Map<string, PerformanceObserver> = new Map();

  constructor() {
    this.budget = {
      pageLoadTime: 3000,           // 3 seconds
      firstContentfulPaint: 1500,   // 1.5 seconds
      firstInputDelay: 100,         // 100ms
      cumulativeLayoutShift: 0.1,   // CLS score
      largestContentfulPaint: 2500, // 2.5 seconds
      bundleSize: 500 * 1024,       // 500KB
      imageOptimization: 85         // 85% compression ratio
    };

    this.initializeMonitoring();
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.setupPerformanceObservers();
    this.monitorResourceLoading();
    this.trackUserInteractions();
    this.monitorMemoryUsage();
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  async collectMetrics(): Promise<PerformanceMetrics> {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    const metrics: PerformanceMetrics = {
      pageLoadTime: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0,
      firstContentfulPaint: this.getPaintMetric(paint, 'first-contentful-paint'),
      firstInputDelay: await this.getFirstInputDelay(),
      cumulativeLayoutShift: await this.getCumulativeLayoutShift(),
      largestContentfulPaint: await this.getLargestContentfulPaint(),
      timeToInteractive: await this.getTimeToInteractive(),
      resourceLoadTimes: this.processResourceTimings(resources),
      memoryUsage: this.getMemoryUsage(),
      connectionInfo: this.getConnectionInfo()
    };

    this.metrics.push(metrics);
    this.checkPerformanceBudget(metrics);
    this.reportMetrics(metrics);

    return metrics;
  }

  async measurePageLoad(pageId: string): Promise<void> {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      const handleLoad = () => {
        const endTime = performance.now();
        const loadTime = endTime - startTime;
        
        this.logPageLoadMetric(pageId, loadTime);
        resolve();
      };

      if (document.readyState === 'complete') {
        handleLoad();
      } else {
        window.addEventListener('load', handleLoad, { once: true });
      }
    });
  }

  measureAsyncOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    const startTime = performance.now();
    
    return operation().then(
      (result) => {
        const duration = performance.now() - startTime;
        this.logAsyncOperation(operationName, duration, 'success', context);
        return result;
      },
      (error) => {
        const duration = performance.now() - startTime;
        this.logAsyncOperation(operationName, duration, 'error', { ...context, error: error.message });
        throw error;
      }
    );
  }

  measureComponentRender(componentName: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      this.logComponentRender(componentName, renderTime);
    };
  }

  trackUserInteraction(interactionType: string, element: string, duration?: number): void {
    const timestamp = Date.now();
    
    auditService.log({
      action: AuditAction.READ,
      entityType: 'user_interaction',
      entityId: `interaction_${timestamp}`,
      metadata: {
        interactionType,
        element,
        duration,
        timestamp,
        url: window.location.pathname
      }
    });
  }

  getPerformanceReport(): {
    summary: PerformanceMetrics;
    trends: Array<{ date: string; metrics: PerformanceMetrics }>;
    alerts: PerformanceAlert[];
    budgetStatus: Record<string, { current: number; budget: number; status: 'pass' | 'fail' }>;
  } {
    const latestMetrics = this.metrics[this.metrics.length - 1];
    
    return {
      summary: latestMetrics || this.getEmptyMetrics(),
      trends: this.getMetricsTrends(),
      alerts: this.alerts.slice(-10), // Last 10 alerts
      budgetStatus: this.getBudgetStatus(latestMetrics)
    };
  }

  setBudget(budget: Partial<PerformanceBudget>): void {
    this.budget = { ...this.budget, ...budget };
  }

  private initializeMonitoring(): void {
    if (typeof window !== 'undefined') {
      // Auto-start monitoring when page loads
      if (document.readyState === 'complete') {
        this.startMonitoring();
      } else {
        window.addEventListener('load', () => this.startMonitoring(), { once: true });
      }

      // Stop monitoring when page unloads
      window.addEventListener('beforeunload', () => this.stopMonitoring());
    }
  }

  private setupPerformanceObservers(): void {
    if (!('PerformanceObserver' in window)) return;

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'largest-contentful-paint') {
          this.checkMetricThreshold('largestContentfulPaint', entry.startTime);
        }
      });
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    this.observers.set('lcp', lcpObserver);

    // First Input Delay
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'first-input') {
          const inputEntry = entry as PerformanceEntryWithInput;
          const processingStart = inputEntry.processingStart ?? entry.startTime;
          const fid = processingStart - entry.startTime;
          this.checkMetricThreshold('firstInputDelay', fid);
        }
      });
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
    this.observers.set('fid', fidObserver);

    // Cumulative Layout Shift
    const clsObserver = new PerformanceObserver((entryList) => {
      let clsScore = 0;
      entryList.getEntries().forEach(entry => {
        if (entry.entryType === 'layout-shift') {
          const layoutEntry = entry as PerformanceEntryWithValue & PerformanceEntryWithInput;
          const hadRecentInput = layoutEntry.hadRecentInput ?? false;
          const value = layoutEntry.value ?? 0;
          
          if (!hadRecentInput) {
            clsScore += value;
          }
        }
      });
      if (clsScore > 0) {
        this.checkMetricThreshold('cumulativeLayoutShift', clsScore);
      }
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });
    this.observers.set('cls', clsObserver);
  }

  private monitorResourceLoading(): void {
    const observer = new PerformanceObserver((entryList) => {
      entryList.getEntries().forEach(entry => {
        if (entry.entryType === 'resource') {
          const resource = entry as PerformanceResourceTiming;
          
          // Check for slow resources
          if (resource.duration > 1000) { // > 1 second
            this.createAlert('slowResource', resource.duration, 1000, {
              resourceName: resource.name,
              resourceType: resource.initiatorType
            });
          }

          // Check for large resources
          if (resource.transferSize > 1024 * 1024) { // > 1MB
            this.createAlert('largeResource', resource.transferSize, 1024 * 1024, {
              resourceName: resource.name,
              resourceType: resource.initiatorType
            });
          }
        }
      });
    });
    
    observer.observe({ entryTypes: ['resource'] });
    this.observers.set('resource', observer);
  }

  private trackUserInteractions(): void {
    const events = ['click', 'input', 'scroll', 'keydown'];
    
    events.forEach(eventType => {
      document.addEventListener(eventType, (event) => {
        const target = event.target as HTMLElement;
        const element = target.tagName.toLowerCase() + 
                       (target.id ? `#${target.id}` : '') +
                       (target.className ? `.${target.className.split(' ').join('.')}` : '');
        
        this.trackUserInteraction(eventType, element);
      }, { passive: true });
    });
  }

  private monitorMemoryUsage(): void {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = this.getMemoryUsage();
        if (memory && memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.9) {
          this.createAlert('highMemoryUsage', memory.usedJSHeapSize, memory.jsHeapSizeLimit * 0.9, {
            totalHeapSize: memory.totalJSHeapSize,
            heapSizeLimit: memory.jsHeapSizeLimit
          });
        }
      }, 30000); // Check every 30 seconds
    }
  }

  private getPaintMetric(paintEntries: PerformanceEntry[], name: string): number {
    const entry = paintEntries.find(entry => entry.name === name);
    return entry ? entry.startTime : 0;
  }

  private async getFirstInputDelay(): Promise<number> {
    return new Promise(resolve => {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            const inputEntry = entries[0] as PerformanceEntryWithInput;
            const processingStart = inputEntry.processingStart ?? entries[0].startTime;
            const fid = processingStart - entries[0].startTime;
            observer.disconnect();
            resolve(fid);
          }
        });
        observer.observe({ entryTypes: ['first-input'] });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(0);
        }, 5000);
      } else {
        resolve(0);
      }
    });
  }

  private async getCumulativeLayoutShift(): Promise<number> {
    return new Promise(resolve => {
      if ('PerformanceObserver' in window) {
        let clsScore = 0;
        const observer = new PerformanceObserver((entryList) => {
          entryList.getEntries().forEach(entry => {
            const layoutEntry = entry as PerformanceEntryWithValue & PerformanceEntryWithInput;
            const hadRecentInput = layoutEntry.hadRecentInput ?? false;
            const value = layoutEntry.value ?? 0;
            
            if (!hadRecentInput) {
              clsScore += value;
            }
          });
        });
        observer.observe({ entryTypes: ['layout-shift'] });
        
        // Calculate final score after 5 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(clsScore);
        }, 5000);
      } else {
        resolve(0);
      }
    });
  }

  private async getLargestContentfulPaint(): Promise<number> {
    return new Promise(resolve => {
      if ('PerformanceObserver' in window) {
        let lcp = 0;
        const observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          if (entries.length > 0) {
            lcp = entries[entries.length - 1].startTime;
          }
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Finalize after 5 seconds
        setTimeout(() => {
          observer.disconnect();
          resolve(lcp);
        }, 5000);
      } else {
        resolve(0);
      }
    });
  }

  private async getTimeToInteractive(): Promise<number> {
    // Simplified TTI calculation
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return navigation ? navigation.domContentLoadedEventEnd - navigation.fetchStart : 0;
  }

  private processResourceTimings(resources: PerformanceResourceTiming[]): ResourceTiming[] {
    return resources.map(resource => ({
      name: resource.name,
      type: resource.initiatorType,
      duration: resource.duration,
      size: resource.transferSize,
      startTime: resource.startTime
    }));
  }

  private getMemoryUsage(): MemoryInfo | undefined {
    if ('memory' in performance) {
      const memory = (performance as unknown as Record<string, unknown>).memory as BrowserMemory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
    return undefined;
  }

  private getConnectionInfo(): ConnectionInfo | undefined {
    if ('connection' in navigator) {
      const connection = (navigator as Record<string, unknown>).connection as BrowserConnection;
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData
      };
    }
    return undefined;
  }

  private checkPerformanceBudget(metrics: PerformanceMetrics): void {
    const checks = [
      { metric: 'pageLoadTime', value: metrics.pageLoadTime, budget: this.budget.pageLoadTime },
      { metric: 'firstContentfulPaint', value: metrics.firstContentfulPaint, budget: this.budget.firstContentfulPaint },
      { metric: 'firstInputDelay', value: metrics.firstInputDelay, budget: this.budget.firstInputDelay },
      { metric: 'cumulativeLayoutShift', value: metrics.cumulativeLayoutShift, budget: this.budget.cumulativeLayoutShift },
      { metric: 'largestContentfulPaint', value: metrics.largestContentfulPaint, budget: this.budget.largestContentfulPaint }
    ];

    checks.forEach(check => {
      if (check.value > check.budget) {
        this.createAlert(check.metric, check.value, check.budget);
      }
    });
  }

  private checkMetricThreshold(metric: string, value: number): void {
    const thresholds: Record<string, number> = {
      largestContentfulPaint: this.budget.largestContentfulPaint,
      firstInputDelay: this.budget.firstInputDelay,
      cumulativeLayoutShift: this.budget.cumulativeLayoutShift
    };

    const threshold = thresholds[metric];
    if (threshold && value > threshold) {
      this.createAlert(metric, value, threshold);
    }
  }

  private createAlert(
    metric: string, 
    value: number, 
    threshold: number, 
    context: Record<string, unknown> = {}
  ): void {
    const severity = value > threshold * 2 ? 'critical' : 'warning';
    
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      metric,
      value,
      threshold,
      severity,
      context: {
        ...context,
        url: window.location.pathname,
        userAgent: navigator.userAgent
      }
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    console.warn(`Performance Alert [${severity}]:`, alert);
  }

  private async logPageLoadMetric(pageId: string, loadTime: number): Promise<void> {
    await auditService.log({
      action: AuditAction.READ,
      entityType: 'performance_metric',
      entityId: `page_load_${Date.now()}`,
      metadata: {
        type: 'page_load',
        pageId,
        loadTime,
        timestamp: Date.now(),
        url: window.location.pathname
      }
    });
  }

  private async logAsyncOperation(
    operationName: string, 
    duration: number, 
    status: 'success' | 'error',
    context: Record<string, unknown>
  ): Promise<void> {
    await auditService.log({
      action: status === 'success' ? AuditAction.READ : AuditAction.SYSTEM_ACTION,
      entityType: 'performance_metric',
      entityId: `async_operation_${Date.now()}`,
      metadata: {
        type: 'async_operation',
        operationName,
        duration,
        status,
        ...context,
        timestamp: Date.now()
      }
    });
  }

  private async logComponentRender(componentName: string, renderTime: number): Promise<void> {
    await auditService.log({
      action: AuditAction.READ,
      entityType: 'performance_metric',
      entityId: `component_render_${Date.now()}`,
      metadata: {
        type: 'component_render',
        componentName,
        renderTime,
        timestamp: Date.now()
      }
    });
  }

  private async reportMetrics(metrics: PerformanceMetrics): Promise<void> {
    await auditService.log({
      action: AuditAction.READ,
      entityType: 'performance_report',
      entityId: `metrics_${Date.now()}`,
      metadata: {
        ...metrics,
        timestamp: Date.now(),
        url: window.location.pathname
      }
    });
  }

  private getEmptyMetrics(): PerformanceMetrics {
    return {
      pageLoadTime: 0,
      firstContentfulPaint: 0,
      firstInputDelay: 0,
      cumulativeLayoutShift: 0,
      largestContentfulPaint: 0,
      timeToInteractive: 0,
      resourceLoadTimes: []
    };
  }

  private getMetricsTrends(): Array<{ date: string; metrics: PerformanceMetrics }> {
    // Return last 7 days of metrics (simplified)
    return this.metrics.slice(-7).map((metrics, index) => ({
      date: new Date(Date.now() - (6 - index) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      metrics
    }));
  }

  private getBudgetStatus(metrics: PerformanceMetrics | undefined): Record<string, { current: number; budget: number; status: 'pass' | 'fail' }> {
    if (!metrics) return {};

    return {
      pageLoadTime: {
        current: metrics.pageLoadTime,
        budget: this.budget.pageLoadTime,
        status: metrics.pageLoadTime <= this.budget.pageLoadTime ? 'pass' : 'fail'
      },
      firstContentfulPaint: {
        current: metrics.firstContentfulPaint,
        budget: this.budget.firstContentfulPaint,
        status: metrics.firstContentfulPaint <= this.budget.firstContentfulPaint ? 'pass' : 'fail'
      },
      firstInputDelay: {
        current: metrics.firstInputDelay,
        budget: this.budget.firstInputDelay,
        status: metrics.firstInputDelay <= this.budget.firstInputDelay ? 'pass' : 'fail'
      },
      cumulativeLayoutShift: {
        current: metrics.cumulativeLayoutShift,
        budget: this.budget.cumulativeLayoutShift,
        status: metrics.cumulativeLayoutShift <= this.budget.cumulativeLayoutShift ? 'pass' : 'fail'
      },
      largestContentfulPaint: {
        current: metrics.largestContentfulPaint,
        budget: this.budget.largestContentfulPaint,
        status: metrics.largestContentfulPaint <= this.budget.largestContentfulPaint ? 'pass' : 'fail'
      }
    };
  }
}

export const performanceService = new PerformanceService();