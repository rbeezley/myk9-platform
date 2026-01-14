/**
 * UI Performance Manager
 * 
 * Manages UI performance for Phase 6 live features, ensuring smooth 60fps
 * interactions during real-time competitions and live updates
 */

import { performanceMonitor } from './PerformanceMonitor';
import { eventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';

export interface UIPerformanceMetrics {
  /** Frame rate and rendering performance */
  rendering: {
    currentFPS: number;
    averageFPS: number;
    frameDrops: number;
    renderTime: number;
    paintTime: number;
    layoutTime: number;
  };
  
  /** React component performance */
  components: {
    renderCount: number;
    averageRenderTime: number;
    memoHitRate: number;
    unnecessaryRenders: number;
    componentTreeDepth: number;
  };
  
  /** Memory usage for UI */
  memory: {
    componentMemory: number;
    eventListenerCount: number;
    domNodeCount: number;
    memoryLeaks: number;
    cacheSize: number;
  };
  
  /** User interaction responsiveness */
  interactions: {
    inputLatency: number;
    clickResponseTime: number;
    scrollPerformance: number;
    keyboardLatency: number;
    touchResponseTime: number;
  };
  
  /** Real-time update performance */
  realTimeUpdates: {
    updateLatency: number;
    batchedUpdates: number;
    droppedUpdates: number;
    updateFrequency: number;
    queueDepth: number;
  };
}

export interface PerformanceOptimization {
  /** Enable React.memo optimizations */
  memoOptimization: boolean;
  
  /** Enable virtual scrolling for large lists */
  virtualScrolling: boolean;
  
  /** Enable component lazy loading */
  lazyLoading: boolean;
  
  /** Enable update batching */
  updateBatching: boolean;
  
  /** Enable render optimization */
  renderOptimization: boolean;
  
  /** Memory management settings */
  memoryManagement: {
    enableCleanup: boolean;
    cleanupInterval: number;
    memoryThreshold: number;
  };
}

export interface UIPerformanceAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'rendering' | 'memory' | 'interactions' | 'updates';
  metric: string;
  threshold: number;
  currentValue: number;
  timestamp: Date;
  message: string;
  impact: 'user-experience' | 'performance' | 'stability';
  recommendations: string[];
  autoOptimize?: boolean;
}

export class UIPerformanceManager {
  private static instance: UIPerformanceManager;
  private metrics: UIPerformanceMetrics;
  private optimization: PerformanceOptimization;
  private alerts: UIPerformanceAlert[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private frameObserver: PerformanceObserver | null = null;
  
  // Performance tracking
  private frameTimings: number[] = [];
  private renderTimings: Array<{ componentName: string; duration: number; timestamp: number }> = [];
  private interactionTimings: Array<{ type: string; latency: number; timestamp: number }> = [];
  private updateQueue: Array<{ timestamp: number; processed: boolean }> = [];
  
  // Optimization state
  private batchedUpdates = new Set<() => void>();
  private batchTimeout: NodeJS.Timeout | null = null;
  private virtualizedComponents = new Set<string>();
  private memoizedComponents = new Set<string>();

  private constructor() {
    this.metrics = this.initializeMetrics();
    this.optimization = this.getDefaultOptimization();
    this.setupPerformanceObservers();
    this.setupEventListeners();
  }

  static getInstance(): UIPerformanceManager {
    if (!UIPerformanceManager.instance) {
      UIPerformanceManager.instance = new UIPerformanceManager();
    }
    return UIPerformanceManager.instance;
  }

  private initializeMetrics(): UIPerformanceMetrics {
    return {
      rendering: {
        currentFPS: 60,
        averageFPS: 60,
        frameDrops: 0,
        renderTime: 0,
        paintTime: 0,
        layoutTime: 0
      },
      components: {
        renderCount: 0,
        averageRenderTime: 0,
        memoHitRate: 0,
        unnecessaryRenders: 0,
        componentTreeDepth: 0
      },
      memory: {
        componentMemory: 0,
        eventListenerCount: 0,
        domNodeCount: 0,
        memoryLeaks: 0,
        cacheSize: 0
      },
      interactions: {
        inputLatency: 0,
        clickResponseTime: 0,
        scrollPerformance: 0,
        keyboardLatency: 0,
        touchResponseTime: 0
      },
      realTimeUpdates: {
        updateLatency: 0,
        batchedUpdates: 0,
        droppedUpdates: 0,
        updateFrequency: 0,
        queueDepth: 0
      }
    };
  }

  private getDefaultOptimization(): PerformanceOptimization {
    return {
      memoOptimization: true,
      virtualScrolling: true,
      lazyLoading: true,
      updateBatching: true,
      renderOptimization: true,
      memoryManagement: {
        enableCleanup: true,
        cleanupInterval: 60000, // 1 minute
        memoryThreshold: 100 // 100MB
      }
    };
  }

  private setupPerformanceObservers(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      // Monitor frame timing
      this.frameObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.entryType === 'measure') {
            this.handleFrameTimingEntry(entry);
          }
        });
      });

      try {
        this.frameObserver.observe({ entryTypes: ['measure', 'navigation', 'paint'] });
      } catch (error) {
        logger.warn('Performance observer not supported:', 'performance', {}, error as Error);
        this.frameObserver = null;
      }
    }
  }

  private setupEventListeners(): void {
    // Listen to React performance events
    eventEmitter.on('react:component-rendered', (data) => {
      if (typeof data === 'object' && data !== null && 'componentName' in data && 'duration' in data) {
        this.handleComponentRender(data as { componentName: string; duration: number; [key: string]: unknown });
      }
    });

    eventEmitter.on('react:component-memoized', (data) => {
      if (typeof data === 'object' && data !== null && 'componentName' in data) {
        this.handleComponentMemoized(data as { componentName: string; [key: string]: unknown });
      }
    });

    // Listen to user interaction events
    eventEmitter.on('ui:interaction', (data) => {
      if (typeof data === 'object' && data !== null && 'type' in data && 'latency' in data) {
        this.handleUserInteraction(data as { type: string; latency: number; [key: string]: unknown });
      }
    });

    // Listen to real-time update events
    eventEmitter.on('realtime:ui-update', () => {
      this.handleRealtimeUpdate();
    });

    // Listen to memory events
    eventEmitter.on('memory:usage-changed', (data) => {
      if (typeof data === 'object' && data !== null && 'usage' in data) {
        this.handleMemoryUsageChange(data as { usage: number; [key: string]: unknown });
      }
    });
  }

  /**
   * Start UI performance monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzePerformance();
      this.applyOptimizations();
    }, 1000); // Monitor every second

    // Start memory cleanup if enabled
    if (this.optimization.memoryManagement.enableCleanup) {
      this.startMemoryCleanup();
    }

    logger.debug('UI performance monitoring started', 'performance', {});
  }

  /**
   * Stop UI performance monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.frameObserver) {
      this.frameObserver.disconnect();
    }

    logger.debug('UI performance monitoring stopped', 'performance', {});
  }

  /**
   * Optimize React component rendering
   */
  optimizeComponentRendering(componentName: string, props: Record<string, unknown>, prevProps?: Record<string, unknown>): boolean {
    const timerId = performanceMonitor.startTimer('component-render-optimization', {
      componentName,
      hasProps: !!props,
      hasPrevProps: !!prevProps
    });

    try {
      // Apply memoization optimization
      if (this.optimization.memoOptimization && prevProps) {
        const shouldSkipRender = this.shouldMemoizeComponent(componentName, props, prevProps);
        
        if (shouldSkipRender) {
          this.memoizedComponents.add(componentName);
          this.metrics.components.memoHitRate = this.calculateMemoHitRate();
          
          performanceMonitor.endTimer(timerId, { 
            success: true, 
            optimized: true,
            action: 'memoized' 
          });
          
          eventEmitter.emit('react:component-memoized', {
            componentName,
            props,
            prevProps
          });
          
          return false; // Skip render
        }
      }

      performanceMonitor.endTimer(timerId, { 
        success: true, 
        optimized: false,
        action: 'render-allowed'
      });

      return true; // Allow render
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return true; // Default to allowing render
    }
  }

  /**
   * Optimize list rendering with virtualization
   */
  optimizeListRendering(listName: string, items: Record<string, unknown>[], viewportHeight: number, itemHeight: number): {
    visibleItems: Record<string, unknown>[];
    startIndex: number;
    endIndex: number;
    totalHeight: number;
  } {
    const timerId = performanceMonitor.startTimer('list-virtualization', {
      listName,
      itemCount: items.length,
      viewportHeight,
      itemHeight
    });

    try {
      if (!this.optimization.virtualScrolling || items.length < 50) {
        // Don't virtualize small lists
        performanceMonitor.endTimer(timerId, { 
          success: true, 
          virtualized: false,
          reason: 'list-too-small'
        });
        
        return {
          visibleItems: items,
          startIndex: 0,
          endIndex: items.length - 1,
          totalHeight: items.length * itemHeight
        };
      }

      // Calculate visible range
      const visibleCount = Math.ceil(viewportHeight / itemHeight);
      const overscan = Math.min(10, Math.ceil(visibleCount * 0.5)); // 50% overscan
      
      // For now, show first visible items (in real implementation, calculate based on scroll position)
      const startIndex = Math.max(0, 0 - overscan);
      const endIndex = Math.min(items.length - 1, visibleCount + overscan);
      
      const visibleItems = items.slice(startIndex, endIndex + 1);
      
      this.virtualizedComponents.add(listName);
      
      performanceMonitor.endTimer(timerId, { 
        success: true, 
        virtualized: true,
        visibleCount: visibleItems.length,
        totalCount: items.length
      });

      eventEmitter.emit('ui:list-virtualized', {
        listName,
        visibleCount: visibleItems.length,
        totalCount: items.length
      });

      return {
        visibleItems,
        startIndex,
        endIndex,
        totalHeight: items.length * itemHeight
      };
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // Fallback to showing all items
      return {
        visibleItems: items,
        startIndex: 0,
        endIndex: items.length - 1,
        totalHeight: items.length * itemHeight
      };
    }
  }

  /**
   * Batch real-time updates for better performance
   */
  batchRealtimeUpdate(updateFn: () => void): void {
    if (!this.optimization.updateBatching) {
      updateFn();
      return;
    }

    // Add to batch
    this.batchedUpdates.add(updateFn);

    // Set timeout to process batch
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatchedUpdates();
      }, 16); // ~60fps
    }
  }

  /**
   * Process batched updates
   */
  private processBatchedUpdates(): void {
    const timerId = performanceMonitor.startTimer('batched-updates-processing');

    try {
      const updateCount = this.batchedUpdates.size;
      
      // Process all batched updates
      this.batchedUpdates.forEach(updateFn => {
        try {
          updateFn();
        } catch (error) {
          logger.error('Error in batched update:', 'performance', {}, error as Error);
        }
      });

      // Clear batch
      this.batchedUpdates.clear();
      this.batchTimeout = null;

      // Update metrics
      this.metrics.realTimeUpdates.batchedUpdates += updateCount;

      performanceMonitor.endTimer(timerId, { 
        success: true, 
        updateCount 
      });

      eventEmitter.emit('ui:updates-batched', {
        updateCount,
        timestamp: Date.now()
      });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Optimize memory usage
   */
  optimizeMemoryUsage(): void {
    const timerId = performanceMonitor.startTimer('memory-optimization');

    try {
      // Clear old performance data
      this.frameTimings = this.frameTimings.slice(-100);
      this.renderTimings = this.renderTimings.slice(-500);
      this.interactionTimings = this.interactionTimings.slice(-200);
      this.updateQueue = this.updateQueue.slice(-1000);

      // Clear old alerts
      this.alerts = this.alerts.slice(-50);

      // Clear component tracking data
      if (this.memoizedComponents.size > 100) {
        const componentsArray = Array.from(this.memoizedComponents);
        this.memoizedComponents.clear();
        // Keep only the most recent half
        componentsArray.slice(-50).forEach(name => this.memoizedComponents.add(name));
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      performanceMonitor.endTimer(timerId, { success: true });

      eventEmitter.emit('ui:memory-optimized', {
        timestamp: Date.now(),
        optimization: 'cache-cleanup'
      });
    } catch (error) {
      performanceMonitor.endTimer(timerId, { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Check if component should be memoized
   */
  private shouldMemoizeComponent(componentName: string, props: Record<string, unknown>, prevProps: Record<string, unknown>): boolean {
    // Simple shallow comparison for props
    const propKeys = Object.keys(props);
    const prevPropKeys = Object.keys(prevProps);

    if (propKeys.length !== prevPropKeys.length) {
      return false;
    }

    for (const key of propKeys) {
      if (props[key] !== prevProps[key]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate memoization hit rate
   */
  private calculateMemoHitRate(): number {
    const totalRenders = this.metrics.components.renderCount;
    const memoizedRenders = this.memoizedComponents.size;
    
    return totalRenders > 0 ? memoizedRenders / totalRenders : 0;
  }

  /**
   * Start automated memory cleanup
   */
  private startMemoryCleanup(): void {
    setInterval(() => {
      const currentMemory = this.getMemoryUsage();
      
      if (currentMemory > this.optimization.memoryManagement.memoryThreshold) {
        this.optimizeMemoryUsage();
      }
    }, this.optimization.memoryManagement.cleanupInterval);
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    // Chrome-specific API - not in standard Performance interface
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    if (perf.memory) {
      return perf.memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  /**
   * Collect current UI performance metrics
   */
  private collectMetrics(): void {
    // Update rendering metrics
    this.updateRenderingMetrics();
    
    // Update component metrics
    this.updateComponentMetrics();
    
    // Update memory metrics
    this.updateMemoryMetrics();
    
    // Update interaction metrics
    this.updateInteractionMetrics();
    
    // Update real-time update metrics
    this.updateRealtimeUpdateMetrics();
  }

  /**
   * Analyze performance and generate alerts
   */
  private analyzePerformance(): void {
    const alerts: UIPerformanceAlert[] = [];

    // Check frame rate
    if (this.metrics.rendering.currentFPS < 30) {
      alerts.push({
        id: `fps-low-${Date.now()}`,
        severity: this.metrics.rendering.currentFPS < 15 ? 'critical' : 'high',
        category: 'rendering',
        metric: 'currentFPS',
        threshold: 60,
        currentValue: this.metrics.rendering.currentFPS,
        timestamp: new Date(),
        message: `Low frame rate: ${this.metrics.rendering.currentFPS} FPS`,
        impact: 'user-experience',
        recommendations: [
          'Enable virtual scrolling for large lists',
          'Optimize component renders with memo',
          'Reduce real-time update frequency',
          'Enable update batching'
        ],
        autoOptimize: true
      });
    }

    // Check memory usage
    if (this.metrics.memory.componentMemory > this.optimization.memoryManagement.memoryThreshold) {
      alerts.push({
        id: `memory-high-${Date.now()}`,
        severity: 'medium',
        category: 'memory',
        metric: 'componentMemory',
        threshold: this.optimization.memoryManagement.memoryThreshold,
        currentValue: this.metrics.memory.componentMemory,
        timestamp: new Date(),
        message: `High memory usage: ${this.metrics.memory.componentMemory.toFixed(1)}MB`,
        impact: 'performance',
        recommendations: [
          'Enable automatic memory cleanup',
          'Reduce component tree depth',
          'Clean up event listeners',
          'Optimize component state'
        ],
        autoOptimize: true
      });
    }

    // Check interaction latency
    if (this.metrics.interactions.inputLatency > 100) { // 100ms threshold
      alerts.push({
        id: `interaction-slow-${Date.now()}`,
        severity: 'high',
        category: 'interactions',
        metric: 'inputLatency',
        threshold: 100,
        currentValue: this.metrics.interactions.inputLatency,
        timestamp: new Date(),
        message: `Slow interaction response: ${this.metrics.interactions.inputLatency}ms`,
        impact: 'user-experience',
        recommendations: [
          'Optimize event handlers',
          'Reduce component re-renders',
          'Enable interaction debouncing',
          'Optimize state updates'
        ]
      });
    }

    // Check real-time update performance
    if (this.metrics.realTimeUpdates.droppedUpdates > 10) {
      alerts.push({
        id: `updates-dropped-${Date.now()}`,
        severity: 'medium',
        category: 'updates',
        metric: 'droppedUpdates',
        threshold: 10,
        currentValue: this.metrics.realTimeUpdates.droppedUpdates,
        timestamp: new Date(),
        message: `Updates being dropped: ${this.metrics.realTimeUpdates.droppedUpdates}`,
        impact: 'performance',
        recommendations: [
          'Enable update batching',
          'Reduce update frequency',
          'Optimize update processing',
          'Increase queue capacity'
        ],
        autoOptimize: true
      });
    }

    // Update alerts
    this.alerts = [...this.alerts, ...alerts].slice(-100);

    // Emit alerts and apply auto-optimizations
    alerts.forEach(alert => {
      eventEmitter.emit('ui:performance-alert', alert);
      
      if (alert.autoOptimize) {
        this.applyAutoOptimization(alert);
      }
    });
  }

  /**
   * Apply automatic optimizations
   */
  private applyOptimizations(): void {
    // Enable optimizations based on current performance
    if (this.metrics.rendering.currentFPS < 45) {
      this.optimization.updateBatching = true;
      this.optimization.memoOptimization = true;
    }

    if (this.metrics.memory.componentMemory > this.optimization.memoryManagement.memoryThreshold * 0.8) {
      this.optimization.memoryManagement.enableCleanup = true;
    }

    if (this.metrics.realTimeUpdates.droppedUpdates > 5) {
      this.optimization.updateBatching = true;
    }
  }

  /**
   * Apply specific auto-optimization based on alert
   */
  private applyAutoOptimization(alert: UIPerformanceAlert): void {
    switch (alert.category) {
      case 'rendering':
        if (alert.metric === 'currentFPS') {
          this.optimization.virtualScrolling = true;
          this.optimization.memoOptimization = true;
          this.optimization.updateBatching = true;
        }
        break;
        
      case 'memory':
        if (alert.metric === 'componentMemory') {
          this.optimizeMemoryUsage();
        }
        break;
        
      case 'updates':
        if (alert.metric === 'droppedUpdates') {
          this.optimization.updateBatching = true;
        }
        break;
    }
  }

  // Event handlers
  private handleFrameTimingEntry(entry: PerformanceEntry): void {
    if (entry.name === 'frame') {
      this.frameTimings.push(entry.duration);
      if (this.frameTimings.length > 1000) {
        this.frameTimings.shift();
      }
    }
  }

  private handleComponentRender(data: { componentName: string; duration: number; [key: string]: unknown }): void {
    this.renderTimings.push({
      componentName: data.componentName,
      duration: data.duration,
      timestamp: Date.now()
    });
    
    this.metrics.components.renderCount++;
  }

  private handleComponentMemoized(data: { componentName: string; [key: string]: unknown }): void {
    this.memoizedComponents.add(data.componentName);
  }

  private handleUserInteraction(data: { type: string; latency: number; [key: string]: unknown }): void {
    this.interactionTimings.push({
      type: data.type,
      latency: data.latency,
      timestamp: Date.now()
    });
  }

  private handleRealtimeUpdate(): void {
    this.updateQueue.push({
      timestamp: Date.now(),
      processed: false
    });
  }

  private handleMemoryUsageChange(data: { usage: number; [key: string]: unknown }): void {
    this.metrics.memory.componentMemory = data.usage;
  }

  // Metric update methods
  private updateRenderingMetrics(): void {
    if (this.frameTimings.length > 0) {
      const recentFrames = this.frameTimings.slice(-60); // Last 60 frames
      const avgFrameTime = recentFrames.reduce((sum, time) => sum + time, 0) / recentFrames.length;
      
      this.metrics.rendering.currentFPS = 1000 / avgFrameTime;
      this.metrics.rendering.averageFPS = this.frameTimings.length > 0 ? 
        1000 / (this.frameTimings.reduce((sum, time) => sum + time, 0) / this.frameTimings.length) : 60;
    }
  }

  private updateComponentMetrics(): void {
    if (this.renderTimings.length > 0) {
      const avgRenderTime = this.renderTimings.reduce((sum, timing) => sum + timing.duration, 0) / this.renderTimings.length;
      this.metrics.components.averageRenderTime = avgRenderTime;
      this.metrics.components.memoHitRate = this.calculateMemoHitRate();
    }
  }

  private updateMemoryMetrics(): void {
    this.metrics.memory.componentMemory = this.getMemoryUsage();
    this.metrics.memory.domNodeCount = document.querySelectorAll('*').length;
  }

  private updateInteractionMetrics(): void {
    if (this.interactionTimings.length > 0) {
      const recentInteractions = this.interactionTimings.filter(
        timing => Date.now() - timing.timestamp < 10000 // Last 10 seconds
      );
      
      if (recentInteractions.length > 0) {
        this.metrics.interactions.inputLatency = 
          recentInteractions.reduce((sum, timing) => sum + timing.latency, 0) / recentInteractions.length;
      }
    }
  }

  private updateRealtimeUpdateMetrics(): void {
    const recentUpdates = this.updateQueue.filter(
      update => Date.now() - update.timestamp < 1000 // Last second
    );
    
    this.metrics.realTimeUpdates.updateFrequency = recentUpdates.length;
    this.metrics.realTimeUpdates.queueDepth = this.updateQueue.filter(u => !u.processed).length;
  }

  /**
   * Get current UI performance metrics
   */
  getMetrics(): UIPerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current alerts
   */
  getAlerts(): UIPerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Get optimization settings
   */
  getOptimization(): PerformanceOptimization {
    return { ...this.optimization };
  }

  /**
   * Update optimization settings
   */
  updateOptimization(newOptimization: Partial<PerformanceOptimization>): void {
    this.optimization = { ...this.optimization, ...newOptimization };
    eventEmitter.emit('ui:optimization-updated', this.optimization);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    overallScore: number;
    status: 'excellent' | 'good' | 'needs-optimization' | 'poor';
    categories: Record<string, { score: number; status: string }>;
    recommendations: string[];
  } {
    const scores = {
      rendering: this.metrics.rendering.currentFPS >= 55 ? 1 : 
                 this.metrics.rendering.currentFPS >= 30 ? 0.7 : 
                 this.metrics.rendering.currentFPS >= 15 ? 0.4 : 0,
      memory: this.metrics.memory.componentMemory <= this.optimization.memoryManagement.memoryThreshold * 0.8 ? 1 : 0.6,
      interactions: this.metrics.interactions.inputLatency <= 50 ? 1 : 
                   this.metrics.interactions.inputLatency <= 100 ? 0.8 : 0.5,
      updates: this.metrics.realTimeUpdates.droppedUpdates <= 5 ? 1 : 0.6
    };

    const overallScore = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length;
    
    let status: 'excellent' | 'good' | 'needs-optimization' | 'poor';
    if (overallScore >= 0.9) status = 'excellent';
    else if (overallScore >= 0.7) status = 'good';
    else if (overallScore >= 0.5) status = 'needs-optimization';
    else status = 'poor';

    const categories = Object.entries(scores).reduce((acc, [key, score]) => {
      acc[key] = {
        score,
        status: score >= 0.8 ? 'good' : score >= 0.6 ? 'fair' : 'poor'
      };
      return acc;
    }, {} as Record<string, { score: number; status: string }>);

    const recommendations: string[] = [];
    if (scores.rendering < 0.8) recommendations.push('Optimize rendering performance');
    if (scores.memory < 0.8) recommendations.push('Reduce memory usage');
    if (scores.interactions < 0.8) recommendations.push('Improve interaction responsiveness');
    if (scores.updates < 0.8) recommendations.push('Optimize real-time updates');

    return {
      overallScore,
      status,
      categories,
      recommendations
    };
  }

  /**
   * Force performance optimization
   */
  forceOptimization(): void {
    logger.debug('Forcing UI performance optimization...', 'performance', {});
    
    // Enable all optimizations
    this.optimization.memoOptimization = true;
    this.optimization.virtualScrolling = true;
    this.optimization.updateBatching = true;
    this.optimization.renderOptimization = true;
    this.optimization.memoryManagement.enableCleanup = true;
    
    // Apply immediate optimizations
    this.optimizeMemoryUsage();
    
    // Process any pending batched updates
    if (this.batchedUpdates.size > 0) {
      this.processBatchedUpdates();
    }
    
    eventEmitter.emit('ui:optimization-forced', {
      timestamp: Date.now(),
      optimization: this.optimization
    });
  }
}

// Export singleton instance
export const uiPerformanceManager = UIPerformanceManager.getInstance();