/**
 * Performance Integration Coordinator
 * 
 * Coordinates all Phase 6 performance optimizations across real-time features,
 * sync operations, and UI performance to maintain <50ms latency targets
 */

import { realtimePerformanceMonitor } from './realtimePerformanceMonitor';
import { syncPerformanceOptimizer } from './syncPerformanceOptimizer';
import { uiPerformanceManager } from './uiPerformanceManager';
import { performanceMonitor } from './PerformanceMonitor';
import { eventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';

export interface OverallPerformanceMetrics {
  /** Overall performance score (0-1) */
  overallScore: number;
  
  /** System status */
  status: 'excellent' | 'good' | 'needs-optimization' | 'critical';
  
  /** Individual component scores */
  components: {
    realtime: number;
    sync: number;
    ui: number;
  };
  
  /** Performance targets */
  targets: {
    latency: number; // Target latency in ms
    throughput: number; // Target operations per second
    uptime: number; // Target uptime percentage
    memoryUsage: number; // Target memory usage in MB
  };
  
  /** Current measurements */
  current: {
    latency: number;
    throughput: number;
    uptime: number;
    memoryUsage: number;
  };
  
  /** Alerts and recommendations */
  alerts: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    component: 'realtime' | 'sync' | 'ui' | 'system';
    message: string;
    recommendations: string[];
  }>;
}

export interface PerformanceBudget {
  /** Maximum acceptable latency */
  maxLatency: number;
  
  /** Minimum acceptable throughput */
  minThroughput: number;
  
  /** Maximum memory usage */
  maxMemoryUsage: number;
  
  /** Minimum uptime percentage */
  minUptime: number;
  
  /** Alert thresholds */
  thresholds: {
    warning: number; // Percentage of budget before warning
    critical: number; // Percentage of budget before critical alert
  };
}

export interface OptimizationStrategy {
  /** Enable automatic optimizations */
  autoOptimize: boolean;
  
  /** Optimization aggressiveness (0-1) */
  aggressiveness: number;
  
  /** Focus areas for optimization */
  focusAreas: Array<'latency' | 'throughput' | 'memory' | 'stability'>;
  
  /** Emergency optimization triggers */
  emergencyTriggers: {
    latencyThreshold: number;
    memoryThreshold: number;
    errorRateThreshold: number;
  };
}

export class PerformanceIntegrationCoordinator {
  private static instance: PerformanceIntegrationCoordinator;
  private isMonitoring = false;
  private coordinationInterval: NodeJS.Timeout | null = null;
  
  // Configuration
  private budget: PerformanceBudget = {
    maxLatency: 50, // 50ms target
    minThroughput: 100, // 100 ops/sec minimum
    maxMemoryUsage: 100, // 100MB maximum
    minUptime: 99.5, // 99.5% uptime
    thresholds: {
      warning: 0.8, // 80% of budget
      critical: 0.95 // 95% of budget
    }
  };
  
  private strategy: OptimizationStrategy = {
    autoOptimize: true,
    aggressiveness: 0.7,
    focusAreas: ['latency', 'memory'],
    emergencyTriggers: {
      latencyThreshold: 100, // 100ms
      memoryThreshold: 150, // 150MB
      errorRateThreshold: 0.05 // 5%
    }
  };
  
  // Performance tracking
  private performanceHistory: Array<{
    timestamp: Date;
    metrics: OverallPerformanceMetrics;
  }> = [];

  private constructor() {
    this.setupEventListeners();
  }

  static getInstance(): PerformanceIntegrationCoordinator {
    if (!PerformanceIntegrationCoordinator.instance) {
      PerformanceIntegrationCoordinator.instance = new PerformanceIntegrationCoordinator();
    }
    return PerformanceIntegrationCoordinator.instance;
  }

  private setupEventListeners(): void {
    // Listen to performance alerts from all components
    eventEmitter.on('realtime:performance-alert', (alert) => {
      if (typeof alert === 'object' && alert !== null) {
        this.handlePerformanceAlert('realtime', alert as { severity?: string; type?: string; [key: string]: unknown });
      }
    });

    eventEmitter.on('sync:performance-alert', (alert) => {
      if (typeof alert === 'object' && alert !== null) {
        this.handlePerformanceAlert('sync', alert as { severity?: string; type?: string; [key: string]: unknown });
      }
    });

    eventEmitter.on('ui:performance-alert', (alert) => {
      if (typeof alert === 'object' && alert !== null) {
        this.handlePerformanceAlert('ui', alert as { severity?: string; type?: string; [key: string]: unknown });
      }
    });

    // Listen to optimization events
    eventEmitter.on('performance:optimization-applied', (data) => {
      if (typeof data === 'object' && data !== null) {
        this.trackOptimization(data as Record<string, unknown>);
      }
    });

    // Listen to system events
    eventEmitter.on('system:memory-warning', () => {
      this.handleSystemAlert('memory');
    });

    eventEmitter.on('system:network-issues', () => {
      this.handleSystemAlert('network');
    });
  }

  /**
   * Start coordinated performance monitoring
   */
  startCoordinatedMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Start all individual monitors
    realtimePerformanceMonitor.startMonitoring();
    syncPerformanceOptimizer.startOptimization();
    uiPerformanceManager.startMonitoring();

    // Start coordination loop
    this.coordinationInterval = setInterval(() => {
      this.coordinatePerformance();
    }, 5000); // Coordinate every 5 seconds

    logger.info('Performance integration coordination started', 'performance');
    eventEmitter.emit('performance:coordination-started', {});
  }

  /**
   * Stop coordinated performance monitoring
   */
  stopCoordinatedMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    // Stop all individual monitors
    realtimePerformanceMonitor.stopMonitoring();
    syncPerformanceOptimizer.stopOptimization();
    uiPerformanceManager.stopMonitoring();

    // Stop coordination loop
    if (this.coordinationInterval) {
      clearInterval(this.coordinationInterval);
      this.coordinationInterval = null;
    }

    logger.info('Performance integration coordination stopped', 'performance');
    eventEmitter.emit('performance:coordination-stopped', {});
  }

  /**
   * Coordinate performance across all components
   */
  private async coordinatePerformance(): Promise<void> {
    const timerId = performanceMonitor.startTimer('performance-coordination');

    try {
      // Collect metrics from all components
      const metrics = await this.collectOverallMetrics();
      
      // Store in history
      this.performanceHistory.push({
        timestamp: new Date(),
        metrics
      });
      
      // Keep only last 100 entries
      if (this.performanceHistory.length > 100) {
        this.performanceHistory = this.performanceHistory.slice(-100);
      }

      // Check performance against budget
      this.checkPerformanceBudget(metrics);

      // Apply coordinated optimizations if needed
      if (this.strategy.autoOptimize) {
        await this.applyCoordinatedOptimizations(metrics);
      }

      // Emit coordination event
      eventEmitter.emit('performance:metrics-updated', metrics);

      performanceMonitor.endTimer(timerId, { success: true });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      logger.error('Error in performance coordination', 'performance', {}, error as Error);
    }
  }

  /**
   * Collect overall performance metrics from all components
   */
  private async collectOverallMetrics(): Promise<OverallPerformanceMetrics> {
    const realtimeMetrics = realtimePerformanceMonitor.getMetrics();
    const syncMetrics = syncPerformanceOptimizer.getMetrics();
    const uiMetrics = uiPerformanceManager.getMetrics();

    const realtimeSummary = realtimePerformanceMonitor.getPerformanceSummary();
    const syncSummary = syncPerformanceOptimizer.getPerformanceSummary();
    const uiSummary = uiPerformanceManager.getPerformanceSummary();

    // Calculate overall score
    const componentScores = {
      realtime: realtimeSummary.score,
      sync: syncSummary.overallScore,
      ui: uiSummary.overallScore
    };

    const overallScore = (componentScores.realtime + componentScores.sync + componentScores.ui) / 3;

    // Determine overall status
    let status: 'excellent' | 'good' | 'needs-optimization' | 'critical';
    if (overallScore >= 0.9) status = 'excellent';
    else if (overallScore >= 0.7) status = 'good';
    else if (overallScore >= 0.5) status = 'needs-optimization';
    else status = 'critical';

    // Calculate current measurements
    const current = {
      latency: Math.max(
        realtimeMetrics.connection.latency,
        syncMetrics.queue.averageProcessingTime,
        uiMetrics.interactions.inputLatency
      ),
      throughput: Math.min(
        realtimeMetrics.updates.messagesPerSecond,
        syncMetrics.queue.throughput || 0,
        60 // UI refresh rate
      ),
      uptime: realtimeMetrics.connection.uptimePercentage,
      memoryUsage: Math.max(
        realtimeMetrics.resources.memoryUsage,
        uiMetrics.memory.componentMemory
      )
    };

    // Collect alerts
    const alerts = [
      ...realtimePerformanceMonitor.getAlerts().map(alert => ({
        severity: alert.type as 'low' | 'medium' | 'high' | 'critical',
        component: 'realtime' as const,
        message: alert.message,
        recommendations: alert.suggestions
      })),
      ...syncPerformanceOptimizer.getAlerts().map(alert => ({
        severity: alert.severity as 'low' | 'medium' | 'high' | 'critical',
        component: 'sync' as const,
        message: alert.message,
        recommendations: alert.recommendations
      })),
      ...uiPerformanceManager.getAlerts().map(alert => ({
        severity: alert.severity as 'low' | 'medium' | 'high' | 'critical',
        component: 'ui' as const,
        message: alert.message,
        recommendations: alert.recommendations
      }))
    ];

    return {
      overallScore,
      status,
      components: componentScores,
      targets: {
        latency: this.budget.maxLatency,
        throughput: this.budget.minThroughput,
        uptime: this.budget.minUptime,
        memoryUsage: this.budget.maxMemoryUsage
      },
      current,
      alerts
    };
  }

  /**
   * Check performance against budget and emit alerts
   */
  private checkPerformanceBudget(metrics: OverallPerformanceMetrics): void {
    const violations: Array<{
      metric: string;
      current: number;
      target: number;
      severity: 'warning' | 'critical';
    }> = [];

    // Check latency
    const latencyRatio = metrics.current.latency / this.budget.maxLatency;
    if (latencyRatio > this.budget.thresholds.critical) {
      violations.push({
        metric: 'latency',
        current: metrics.current.latency,
        target: this.budget.maxLatency,
        severity: 'critical'
      });
    } else if (latencyRatio > this.budget.thresholds.warning) {
      violations.push({
        metric: 'latency',
        current: metrics.current.latency,
        target: this.budget.maxLatency,
        severity: 'warning'
      });
    }

    // Check memory usage
    const memoryRatio = metrics.current.memoryUsage / this.budget.maxMemoryUsage;
    if (memoryRatio > this.budget.thresholds.critical) {
      violations.push({
        metric: 'memory',
        current: metrics.current.memoryUsage,
        target: this.budget.maxMemoryUsage,
        severity: 'critical'
      });
    } else if (memoryRatio > this.budget.thresholds.warning) {
      violations.push({
        metric: 'memory',
        current: metrics.current.memoryUsage,
        target: this.budget.maxMemoryUsage,
        severity: 'warning'
      });
    }

    // Check throughput
    if (metrics.current.throughput < this.budget.minThroughput * this.budget.thresholds.warning) {
      violations.push({
        metric: 'throughput',
        current: metrics.current.throughput,
        target: this.budget.minThroughput,
        severity: metrics.current.throughput < this.budget.minThroughput * 0.5 ? 'critical' : 'warning'
      });
    }

    // Check uptime
    if (metrics.current.uptime < this.budget.minUptime) {
      violations.push({
        metric: 'uptime',
        current: metrics.current.uptime,
        target: this.budget.minUptime,
        severity: metrics.current.uptime < this.budget.minUptime * 0.95 ? 'critical' : 'warning'
      });
    }

    // Emit budget violations
    violations.forEach(violation => {
      eventEmitter.emit('performance:budget-violation', violation);
    });
  }

  /**
   * Apply coordinated optimizations based on current performance
   */
  private async applyCoordinatedOptimizations(metrics: OverallPerformanceMetrics): Promise<void> {
    const optimizations: string[] = [];

    // Emergency optimizations
    if (metrics.current.latency > this.strategy.emergencyTriggers.latencyThreshold) {
      realtimePerformanceMonitor.forceOptimization();
      uiPerformanceManager.forceOptimization();
      optimizations.push('emergency-latency-optimization');
    }

    if (metrics.current.memoryUsage > this.strategy.emergencyTriggers.memoryThreshold) {
      uiPerformanceManager.optimizeMemoryUsage();
      optimizations.push('emergency-memory-cleanup');
    }

    // Proactive optimizations based on strategy
    if (this.strategy.focusAreas.includes('latency') && metrics.components.realtime < 0.8) {
      realtimePerformanceMonitor.updateConfig({
        aggressiveOptimization: true,
        smartBatching: true
      });
      optimizations.push('realtime-latency-optimization');
    }

    if (this.strategy.focusAreas.includes('memory') && metrics.components.ui < 0.8) {
      uiPerformanceManager.updateOptimization({
        memoryManagement: {
          enableCleanup: true,
          cleanupInterval: 30000, // More frequent cleanup
          memoryThreshold: this.budget.maxMemoryUsage * 0.8
        }
      });
      optimizations.push('ui-memory-optimization');
    }

    if (this.strategy.focusAreas.includes('throughput') && metrics.components.sync < 0.8) {
      syncPerformanceOptimizer.updateStrategy({
        intelligentBatching: true,
        adaptiveBatching: true,
        priorityOptimization: true
      });
      optimizations.push('sync-throughput-optimization');
    }

    // Log applied optimizations
    if (optimizations.length > 0) {
      logger.info('Applied coordinated optimizations', 'performance', { optimizations });
      eventEmitter.emit('performance:optimizations-applied', {
        optimizations,
        metrics,
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle performance alerts from individual components
   */
  private handlePerformanceAlert(component: string, alert: { severity?: string; type?: string; [key: string]: unknown }): void {
    // Escalate critical alerts
    if (alert.severity === 'critical' || alert.type === 'critical') {
      this.handleCriticalAlert(component, alert);
    }

    // Track alert patterns
    eventEmitter.emit('performance:alert-tracked', {
      component,
      alert,
      timestamp: new Date()
    });
  }

  /**
   * Handle critical performance alerts
   */
  private handleCriticalAlert(component: string, alert: { metric?: string; [key: string]: unknown }): void {
    logger.warn('Critical performance alert', 'performance', { component, alert });

    // Apply emergency optimizations
    if (component === 'realtime' && alert.metric === 'latency') {
      realtimePerformanceMonitor.forceOptimization();
    } else if (component === 'ui' && alert.metric === 'memory') {
      uiPerformanceManager.optimizeMemoryUsage();
    } else if (component === 'sync' && alert.metric === 'queueDepth') {
      syncPerformanceOptimizer.updateStrategy({
        adaptiveBatching: true,
        priorityOptimization: true
      });
    }

    eventEmitter.emit('performance:critical-alert', {
      component,
      alert,
      timestamp: new Date()
    });
  }

  /**
   * Handle system-level alerts
   */
  private handleSystemAlert(type: string): void {
    switch (type) {
      case 'memory':
        // Force memory optimization across all components
        uiPerformanceManager.optimizeMemoryUsage();
        break;
      case 'network':
        // Optimize network usage
        realtimePerformanceMonitor.updateConfig({
          connectionPooling: {
            enabled: true,
            maxConnections: 3,
            reuseConnections: true
          }
        });
        break;
    }
  }

  /**
   * Track optimization applications
   */
  private trackOptimization(data: Record<string, unknown>): void {
    // Track optimization effectiveness
    eventEmitter.emit('performance:optimization-tracked', {
      ...data,
      timestamp: new Date()
    });
  }

  /**
   * Get current overall performance metrics
   */
  async getCurrentMetrics(): Promise<OverallPerformanceMetrics> {
    return await this.collectOverallMetrics();
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(): Array<{ timestamp: Date; metrics: OverallPerformanceMetrics }> {
    return [...this.performanceHistory];
  }

  /**
   * Update performance budget
   */
  updateBudget(newBudget: Partial<PerformanceBudget>): void {
    this.budget = { ...this.budget, ...newBudget };
    eventEmitter.emit('performance:budget-updated', this.budget);
  }

  /**
   * Update optimization strategy
   */
  updateStrategy(newStrategy: Partial<OptimizationStrategy>): void {
    this.strategy = { ...this.strategy, ...newStrategy };
    eventEmitter.emit('performance:strategy-updated', this.strategy);
  }

  /**
   * Get current budget
   */
  getBudget(): PerformanceBudget {
    return { ...this.budget };
  }

  /**
   * Get current strategy
   */
  getStrategy(): OptimizationStrategy {
    return { ...this.strategy };
  }

  /**
   * Force system-wide optimization
   */
  forceSystemOptimization(): void {
    logger.info('Forcing system-wide performance optimization', 'performance');
    
    realtimePerformanceMonitor.forceOptimization();
    uiPerformanceManager.forceOptimization();
    
    syncPerformanceOptimizer.updateStrategy({
      intelligentBatching: true,
      adaptiveBatching: true,
      priorityOptimization: true,
      deltaCompression: true,
      conflictPrediction: true
    });

    eventEmitter.emit('performance:system-optimization-forced', {
      timestamp: new Date()
    });
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(): Promise<{
    summary: OverallPerformanceMetrics;
    trends: Array<{ metric: string; trend: 'improving' | 'stable' | 'degrading' }>;
    recommendations: string[];
  }> {
    const summary = await this.getCurrentMetrics();
    
    // Analyze trends from history
    const trends = this.analyzePerformanceTrends();
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, trends);

    return {
      summary,
      trends,
      recommendations
    };
  }

  /**
   * Analyze performance trends from history
   */
  private analyzePerformanceTrends(): Array<{ metric: string; trend: 'improving' | 'stable' | 'degrading' }> {
    if (this.performanceHistory.length < 10) {
      return []; // Need at least 10 data points
    }

    const recent = this.performanceHistory.slice(-10);
    const older = this.performanceHistory.slice(-20, -10);

    if (older.length === 0) return [];

    const metrics = ['latency', 'throughput', 'memoryUsage', 'uptime'] as const;
    
    return metrics.map(metric => {
      const recentAvg = recent.reduce((sum, entry) => sum + entry.metrics.current[metric], 0) / recent.length;
      const olderAvg = older.reduce((sum, entry) => sum + entry.metrics.current[metric], 0) / older.length;
      
      const change = (recentAvg - olderAvg) / olderAvg;
      
      let trend: 'improving' | 'stable' | 'degrading';
      if (metric === 'throughput' || metric === 'uptime') {
        // Higher is better
        if (change > 0.05) trend = 'improving';
        else if (change < -0.05) trend = 'degrading';
        else trend = 'stable';
      } else {
        // Lower is better
        if (change < -0.05) trend = 'improving';
        else if (change > 0.05) trend = 'degrading';
        else trend = 'stable';
      }

      return { metric, trend };
    });
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    metrics: OverallPerformanceMetrics,
    trends: Array<{ metric: string; trend: 'improving' | 'stable' | 'degrading' }>
  ): string[] {
    const recommendations: string[] = [];

    // Budget-based recommendations
    if (metrics.current.latency > this.budget.maxLatency * 0.8) {
      recommendations.push('Consider enabling aggressive optimization for latency reduction');
    }

    if (metrics.current.memoryUsage > this.budget.maxMemoryUsage * 0.8) {
      recommendations.push('Implement more frequent memory cleanup and component optimization');
    }

    // Trend-based recommendations
    const degradingMetrics = trends.filter(t => t.trend === 'degrading');
    if (degradingMetrics.length > 0) {
      recommendations.push(`Address degrading performance in: ${degradingMetrics.map(m => m.metric).join(', ')}`);
    }

    // Component-specific recommendations
    if (metrics.components.realtime < 0.7) {
      recommendations.push('Optimize real-time connection management and message batching');
    }

    if (metrics.components.sync < 0.7) {
      recommendations.push('Improve sync queue processing and conflict resolution');
    }

    if (metrics.components.ui < 0.7) {
      recommendations.push('Optimize UI rendering and implement better virtualization');
    }

    return recommendations;
  }
}

// Export singleton instance
export const performanceIntegrationCoordinator = PerformanceIntegrationCoordinator.getInstance();