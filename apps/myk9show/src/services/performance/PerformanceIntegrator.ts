/**
 * Performance Integrator Service
 * 
 * Coordinates all performance optimization services to achieve target metrics:
 * - LCP: 3.1s → <2.5s target (-600ms improvement)
 * - Bundle Size: Current → <500KB initial target  
 * - Mobile: 3.5s → <3s target on Dogs/Shows pages
 * - FID: <100ms, CLS: <0.1 maintained
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { initializeCoreWebVitalsOptimization, getCoreWebVitalsOptimizer } from './CoreWebVitalsOptimizer';
import { initializeBundleOptimization, getBundleOptimizer } from './BundleOptimizer';
import { initializeMobilePerformanceOptimization, getMobilePerformanceOptimizer, MobileOptimizationConfig } from './MobilePerformanceOptimizer';
import { initializeRUM, getRumService } from './RealUserMonitoring';

export interface PerformanceTargets {
  lcp: number; // Largest Contentful Paint in ms
  fid: number; // First Input Delay in ms
  cls: number; // Cumulative Layout Shift score
  ttfb: number; // Time to First Byte in ms
  bundleSize: number; // Initial bundle size in KB
  mobileLcp: number; // LCP on mobile in ms
}

export interface PerformanceMetrics {
  current: PerformanceTargets;
  target: PerformanceTargets;
  improvement: PerformanceTargets;
  score: number; // Overall performance score 0-100
}

export interface OptimizationPlan {
  phase: 'initialization' | 'optimization' | 'monitoring' | 'complete';
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  estimatedTimeRemaining: number; // in seconds
  optimizations: OptimizationStep[];
}

export interface OptimizationStep {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  impact: {
    lcp?: number;
    fid?: number;
    cls?: number;
    bundleSize?: number;
  };
  startTime?: number;
  endTime?: number;
  error?: string;
}

export class PerformanceIntegrator {
  private static instance: PerformanceIntegrator | null = null;
  
  private targets: PerformanceTargets = {
    lcp: 2500,      // Target: <2.5s (current ~3.1s)
    fid: 100,       // Target: <100ms
    cls: 0.1,       // Target: <0.1
    ttfb: 600,      // Target: <600ms
    bundleSize: 500, // Target: <500KB initial
    mobileLcp: 3000, // Target: <3s on mobile (current ~3.5s)
  };
  
  private currentMetrics: PerformanceTargets = {
    lcp: 3100,      // Current baseline
    fid: 80,        // Current baseline
    cls: 0.08,      // Current baseline
    ttfb: 800,      // Current baseline
    bundleSize: 0,  // Will be measured
    mobileLcp: 3500, // Current mobile baseline
  };
  
  private optimizationPlan: OptimizationPlan = {
    phase: 'initialization',
    currentStep: 'Starting performance analysis',
    totalSteps: 12,
    completedSteps: 0,
    estimatedTimeRemaining: 30,
    optimizations: [],
  };
  
  private isInitialized = false;
  private optimizationStartTime = 0;
  private callbacks: Set<(plan: OptimizationPlan) => void> = new Set();

  private constructor() {
    this.initializeOptimizationSteps();
  }

  public static getInstance(): PerformanceIntegrator {
    if (!PerformanceIntegrator.instance) {
      PerformanceIntegrator.instance = new PerformanceIntegrator();
    }
    return PerformanceIntegrator.instance;
  }

  /**
   * Initialize comprehensive performance optimization
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('Performance integrator already initialized');
      return;
    }

    console.log('🚀 Starting comprehensive performance optimization');
    this.optimizationStartTime = Date.now();
    
    try {
      // Phase 1: Initialization and Analysis
      await this.executePhase1();
      
      // Phase 2: Core Optimizations
      await this.executePhase2();
      
      // Phase 3: Advanced Optimizations
      await this.executePhase3();
      
      // Phase 4: Monitoring and Validation
      await this.executePhase4();
      
      this.isInitialized = true;
      this.updateOptimizationPlan('complete', 'Performance optimization completed successfully');
      
      console.log('✅ Performance optimization completed');
      this.logFinalResults();
      
    } catch (error) {
      console.error('❌ Performance optimization failed:', error);
      this.updateOptimizationPlan('initialization', `Optimization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Initialize optimization steps configuration
   */
  private initializeOptimizationSteps(): void {
    this.optimizationPlan.optimizations = [
      // Phase 1: Initialization
      {
        name: 'rum_initialization',
        description: 'Initialize Real User Monitoring',
        status: 'pending',
        impact: { lcp: 0 }, // Monitoring only
      },
      {
        name: 'baseline_measurement',
        description: 'Measure current performance baseline',
        status: 'pending',
        impact: { lcp: 0 }, // Measurement only
      },
      {
        name: 'bundle_analysis',
        description: 'Analyze bundle composition and identify optimization opportunities',
        status: 'pending',
        impact: { bundleSize: 200 }, // Expected bundle size reduction
      },
      
      // Phase 2: Core Optimizations
      {
        name: 'core_web_vitals_optimization',
        description: 'Apply Core Web Vitals optimizations (LCP, CLS, FID)',
        status: 'pending',
        impact: { lcp: 800, cls: 0.03, fid: 30 },
      },
      {
        name: 'bundle_optimization',
        description: 'Optimize bundle size and loading strategies',
        status: 'pending',
        impact: { lcp: 400, bundleSize: 300 },
      },
      {
        name: 'mobile_optimization',
        description: 'Apply mobile-specific performance optimizations',
        status: 'pending',
        impact: { lcp: 600 }, // Mobile LCP improvement
      },
      
      // Phase 3: Advanced Optimizations
      {
        name: 'image_optimization',
        description: 'Optimize image loading and compression',
        status: 'pending',
        impact: { lcp: 300, bundleSize: 100 },
      },
      {
        name: 'font_optimization',
        description: 'Optimize font loading strategies',
        status: 'pending',
        impact: { lcp: 200 },
      },
      {
        name: 'resource_prioritization',
        description: 'Prioritize critical resources and defer non-critical ones',
        status: 'pending',
        impact: { lcp: 250 },
      },
      {
        name: 'network_optimization',
        description: 'Apply network-aware loading optimizations',
        status: 'pending',
        impact: { lcp: 200 },
      },
      
      // Phase 4: Monitoring and Validation
      {
        name: 'performance_monitoring',
        description: 'Set up continuous performance monitoring',
        status: 'pending',
        impact: { lcp: 0 }, // Monitoring only
      },
      {
        name: 'validation_testing',
        description: 'Validate optimization results and measure improvements',
        status: 'pending',
        impact: { lcp: 0 }, // Validation only
      },
    ];
  }

  /**
   * Phase 1: Initialization and Analysis
   */
  private async executePhase1(): Promise<void> {
    this.updateOptimizationPlan('initialization', 'Initializing monitoring and analysis');

    // Step 1: Initialize RUM
    await this.executeOptimizationStep('rum_initialization', async () => {
      initializeRUM();
      await this.wait(1000); // Allow RUM to start collecting data
    });

    // Step 2: Measure baseline
    await this.executeOptimizationStep('baseline_measurement', async () => {
      await this.measureCurrentPerformance();
    });

    // Step 3: Analyze bundle
    await this.executeOptimizationStep('bundle_analysis', async () => {
      const bundleOptimizer = getBundleOptimizer();
      await bundleOptimizer.analyzeBundles();
    });
  }

  /**
   * Phase 2: Core Optimizations
   */
  private async executePhase2(): Promise<void> {
    this.updateOptimizationPlan('optimization', 'Applying core performance optimizations');

    // Step 4: Core Web Vitals optimization
    await this.executeOptimizationStep('core_web_vitals_optimization', async () => {
      await initializeCoreWebVitalsOptimization();
    });

    // Step 5: Bundle optimization  
    await this.executeOptimizationStep('bundle_optimization', async () => {
      await initializeBundleOptimization();
    });

    // Step 6: Mobile optimization
    await this.executeOptimizationStep('mobile_optimization', async () => {
      const mobileConfig: Partial<MobileOptimizationConfig> = {
        enableDataSaver: true,
        networkAwareLoading: true,
        batteryOptimization: true,
      };
      await initializeMobilePerformanceOptimization(mobileConfig);
    });
  }

  /**
   * Phase 3: Advanced Optimizations
   */
  private async executePhase3(): Promise<void> {
    this.updateOptimizationPlan('optimization', 'Applying advanced optimizations');

    // Step 7: Image optimization
    await this.executeOptimizationStep('image_optimization', async () => {
      await this.optimizeImages();
    });

    // Step 8: Font optimization
    await this.executeOptimizationStep('font_optimization', async () => {
      await this.optimizeFonts();
    });

    // Step 9: Resource prioritization
    await this.executeOptimizationStep('resource_prioritization', async () => {
      await this.prioritizeResources();
    });

    // Step 10: Network optimization
    await this.executeOptimizationStep('network_optimization', async () => {
      await this.optimizeNetworkUsage();
    });
  }

  /**
   * Phase 4: Monitoring and Validation
   */
  private async executePhase4(): Promise<void> {
    this.updateOptimizationPlan('monitoring', 'Setting up monitoring and validation');

    // Step 11: Performance monitoring
    await this.executeOptimizationStep('performance_monitoring', async () => {
      await this.setupContinuousMonitoring();
    });

    // Step 12: Validation testing
    await this.executeOptimizationStep('validation_testing', async () => {
      await this.validateOptimizations();
    });
  }

  /**
   * Execute a single optimization step
   */
  private async executeOptimizationStep(stepName: string, execution: () => Promise<void>): Promise<void> {
    const step = this.optimizationPlan.optimizations.find(opt => opt.name === stepName);
    if (!step) {
      throw new Error(`Optimization step not found: ${stepName}`);
    }

    try {
      step.status = 'running';
      step.startTime = Date.now();
      this.updateOptimizationPlan(this.optimizationPlan.phase, `Executing: ${step.description}`);

      await execution();

      step.status = 'completed';
      step.endTime = Date.now();
      this.optimizationPlan.completedSteps++;
      
      // Update estimated time remaining
      const avgTimePerStep = (Date.now() - this.optimizationStartTime) / this.optimizationPlan.completedSteps;
      const remainingSteps = this.optimizationPlan.totalSteps - this.optimizationPlan.completedSteps;
      this.optimizationPlan.estimatedTimeRemaining = Math.round((avgTimePerStep * remainingSteps) / 1000);

      console.log(`✅ Completed: ${step.description}`);
      this.notifyCallbacks();

    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed: ${step.description}`, error);
      throw error;
    }
  }

  /**
   * Measure current performance baseline
   */
  private async measureCurrentPerformance(): Promise<void> {
    const rumService = getRumService();
    
    // Wait for initial measurements
    await this.wait(3000);
    
    const performanceData = rumService.getPerformanceSummary();
    
    // Update current metrics with real measurements
    if (performanceData.vitals.LCP) {
      this.currentMetrics.lcp = performanceData.vitals.LCP;
    }
    if (performanceData.vitals.FID) {
      this.currentMetrics.fid = performanceData.vitals.FID;
    }
    if (performanceData.vitals.CLS) {
      this.currentMetrics.cls = performanceData.vitals.CLS;
    }
    if (performanceData.vitals.TTFB) {
      this.currentMetrics.ttfb = performanceData.vitals.TTFB;
    }

    // Measure bundle size from performance entries
    const scriptEntries = performance.getEntriesByType('resource')
      .filter(entry => entry.name.endsWith('.js'))
      .map(entry => entry as PerformanceResourceTiming);
    
    const totalBundleSize = scriptEntries.reduce((total, entry) => {
      return total + (entry.encodedBodySize || entry.transferSize || 0);
    }, 0);
    
    this.currentMetrics.bundleSize = Math.round(totalBundleSize / 1024); // Convert to KB

    console.log('📊 Current performance baseline:', this.currentMetrics);
  }

  /**
   * Optimize images for better performance
   */
  private async optimizeImages(): Promise<void> {
    // Add comprehensive image optimization
    const style = document.createElement('style');
    style.textContent = `
      /* Image optimization styles */
      img {
        loading: lazy;
        decoding: async;
      }
      
      img[data-priority="high"] {
        loading: eager;
        fetchpriority: high;
      }
      
      .image-container {
        position: relative;
        overflow: hidden;
      }
      
      .image-placeholder {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
      }
      
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `;
    document.head.appendChild(style);

    // Implement responsive images
    this.implementResponsiveImages();
    
    // Set up image lazy loading with intersection observer
    this.setupImageLazyLoading();
  }

  /**
   * Implement responsive images
   */
  private implementResponsiveImages(): void {
    document.querySelectorAll('img').forEach(img => {
      const imageElement = img as HTMLImageElement;
      
      // Skip if already has srcset
      if (imageElement.srcset) return;
      
      const src = imageElement.src;
      if (!src) return;

      // Generate responsive srcset
      const sizes = [480, 768, 1024, 1200];
      const srcset = sizes.map(size => {
        const url = new URL(src, window.location.origin);
        url.searchParams.set('w', size.toString());
        return `${url.toString()} ${size}w`;
      }).join(', ');

      imageElement.srcset = srcset;
      imageElement.sizes = '(max-width: 480px) 100vw, (max-width: 768px) 100vw, (max-width: 1024px) 100vw, 1200px';
    });
  }

  /**
   * Set up image lazy loading
   */
  private setupImageLazyLoading(): void {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            img.removeAttribute('data-srcset');
          }
          
          img.classList.remove('image-placeholder');
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px 0px',
      threshold: 0.01,
    });

    // Observe all images with data-src
    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }

  /**
   * Optimize fonts for better performance
   */
  private async optimizeFonts(): Promise<void> {
    // Add font optimization styles
    const style = document.createElement('style');
    style.textContent = `
      /* Font optimization */
      @font-face {
        font-family: 'Inter';
        font-display: swap;
        font-weight: 100 900;
        src: url('/fonts/inter-var.woff2') format('woff2-variations');
      }
      
      /* Fallback fonts */
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      }
      
      /* Reduce font loading impact */
      .font-loading {
        visibility: hidden;
      }
      
      .font-loaded .font-loading {
        visibility: visible;
      }
    `;
    document.head.appendChild(style);

    // Preload critical fonts
    const criticalFonts = [
      '/fonts/inter-var.woff2',
      '/fonts/inter-regular.woff2',
    ];

    criticalFonts.forEach(fontUrl => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.type = 'font/woff2';
      link.href = fontUrl;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });

    // Implement font loading optimization
    this.implementFontLoadingOptimization();
  }

  /**
   * Implement font loading optimization
   */
  private implementFontLoadingOptimization(): void {
    if ('fonts' in document) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('font-loaded');
        console.log('✅ Fonts loaded successfully');
      });

      // Set a timeout to prevent indefinite waiting
      setTimeout(() => {
        if (!document.documentElement.classList.contains('font-loaded')) {
          document.documentElement.classList.add('font-loaded');
          console.warn('⚠️ Font loading timeout - proceeding with fallback fonts');
        }
      }, 3000);
    }
  }

  /**
   * Prioritize critical resources
   */
  private async prioritizeResources(): Promise<void> {
    // Set priority hints for critical resources
    const criticalResources = [
      { selector: 'link[rel="stylesheet"]', priority: 'high' },
      { selector: 'script[src*="main"]', priority: 'high' },
      { selector: 'script[src*="vendor"]', priority: 'medium' },
      { selector: 'img[data-priority="high"]', priority: 'high' },
    ];

    criticalResources.forEach(({ selector, priority }) => {
      document.querySelectorAll(selector).forEach(element => {
        element.setAttribute('fetchpriority', priority);
      });
    });

    // Defer non-critical resources
    const nonCriticalResources = [
      'script[src*="analytics"]',
      'script[src*="tracking"]',
      'link[rel="stylesheet"][href*="non-critical"]',
    ];

    nonCriticalResources.forEach(selector => {
      document.querySelectorAll(selector).forEach(element => {
        if (element.tagName === 'SCRIPT') {
          (element as HTMLScriptElement).defer = true;
        } else if (element.tagName === 'LINK') {
          element.setAttribute('media', 'print');
          element.setAttribute('onload', "this.media='all'");
        }
      });
    });

    // Implement resource hints
    this.implementResourceHints();
  }

  /**
   * Implement resource hints
   */
  private implementResourceHints(): void {
    // DNS prefetch for external domains
    const externalDomains = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdnjs.cloudflare.com',
    ];

    externalDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `//${domain}`;
      document.head.appendChild(link);
    });

    // Preconnect to critical external resources
    const criticalExternalResources = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ];

    criticalExternalResources.forEach(url => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = url;
      link.crossOrigin = '';
      document.head.appendChild(link);
    });
  }

  /**
   * Optimize network usage
   */
  private async optimizeNetworkUsage(): Promise<void> {
    // Implement request coalescing
    this.implementRequestCoalescing();
    
    // Set up intelligent prefetching
    this.setupIntelligentPrefetching();
    
    // Optimize API calls
    this.optimizeApiCalls();
  }

  /**
   * Implement request coalescing
   */
  private implementRequestCoalescing(): void {
    const requestQueue = new Map<string, Promise<Response>>();
    
    // Override fetch to implement request coalescing
    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const key = `${method}:${url}`;
      
      // Return existing request if same URL and method
      if (requestQueue.has(key)) {
        return requestQueue.get(key)!.then(response => response.clone());
      }
      
      // Create new request and cache it
      const request = originalFetch(input, init);
      requestQueue.set(key, request);
      
      // Clean up after request completes
      request.finally(() => {
        setTimeout(() => {
          requestQueue.delete(key);
        }, 1000); // Keep in cache for 1 second
      });
      
      return request;
    };
  }

  /**
   * Set up intelligent prefetching
   */
  private setupIntelligentPrefetching(): void {
    // Prefetch based on user behavior patterns
    const prefetchObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const link = entry.target as HTMLAnchorElement;
          if (link.href && !link.dataset.prefetched) {
            // Delay prefetch to avoid impacting current page performance
            setTimeout(() => {
              const prefetchLink = document.createElement('link');
              prefetchLink.rel = 'prefetch';
              prefetchLink.href = link.href;
              document.head.appendChild(prefetchLink);
              link.dataset.prefetched = 'true';
            }, 500);
          }
        }
      });
    }, {
      rootMargin: '100px 0px',
      threshold: 0.1,
    });

    // Observe navigation links
    document.querySelectorAll('a[href^="/"]').forEach(link => {
      prefetchObserver.observe(link);
    });
  }

  /**
   * Optimize API calls
   */
  private optimizeApiCalls(): void {
    // Implement request batching for API calls
    const requestBatch: Array<{ url: string; resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
    let batchTimeout: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (requestBatch.length === 0) return;
      
      const batch = requestBatch.splice(0);
      batchTimeout = null;
      
      try {
        // For now, process requests individually
        // In a real implementation, you'd batch them into a single request
        const results = await Promise.allSettled(
          batch.map(({ url }) => fetch(url))
        );
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            batch[index].resolve(result.value);
          } else {
            batch[index].reject(result.reason);
          }
        });
      } catch (error) {
        batch.forEach(({ reject }) => reject(error as Error));
      }
    };

    // Override fetch for API requests to enable batching
    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      // Only batch API requests
      if (url.includes('/api/')) {
        return new Promise<Response>((resolve, reject) => {
          requestBatch.push({ url, resolve: resolve as (value: unknown) => void, reject });
          
          // Process batch after a short delay
          if (!batchTimeout) {
            batchTimeout = setTimeout(processBatch, 10);
          }
        });
      }
      
      return originalFetch(input, init);
    };
  }

  /**
   * Set up continuous performance monitoring
   */
  private async setupContinuousMonitoring(): Promise<void> {
    // Set up periodic performance checks
    setInterval(() => {
      this.checkPerformanceRegression();
    }, 60000); // Check every minute

    // Monitor for performance budget violations
    this.setupPerformanceBudgetMonitoring();
    
    // Set up user experience monitoring
    this.setupUXMonitoring();
  }

  /**
   * Check for performance regression
   */
  private checkPerformanceRegression(): void {
    const rumService = getRumService();
    const currentPerformance = rumService.getPerformanceSummary();
    
    // Check if performance has regressed
    const regressions = [];
    
    if (currentPerformance.vitals.LCP && currentPerformance.vitals.LCP > this.targets.lcp * 1.1) {
      regressions.push(`LCP regressed to ${currentPerformance.vitals.LCP}ms (target: ${this.targets.lcp}ms)`);
    }
    
    if (currentPerformance.vitals.FID && currentPerformance.vitals.FID > this.targets.fid * 1.1) {
      regressions.push(`FID regressed to ${currentPerformance.vitals.FID}ms (target: ${this.targets.fid}ms)`);
    }
    
    if (currentPerformance.vitals.CLS && currentPerformance.vitals.CLS > this.targets.cls * 1.1) {
      regressions.push(`CLS regressed to ${currentPerformance.vitals.CLS} (target: ${this.targets.cls})`);
    }
    
    if (regressions.length > 0) {
      console.warn('⚠️ Performance regression detected:', regressions);
      rumService.trackCustomMetric('performance_regression_detected', regressions.length, {
        regressions: regressions.join('; '),
      });
    }
  }

  /**
   * Set up performance budget monitoring
   */
  private setupPerformanceBudgetMonitoring(): void {
    const checkBudgets = () => {
      const violations = [];
      
      // Check bundle size budget
      const currentBundleSize = this.getCurrentBundleSize();
      if (currentBundleSize > this.targets.bundleSize) {
        violations.push(`Bundle size budget exceeded: ${currentBundleSize}KB > ${this.targets.bundleSize}KB`);
      }
      
      // Check resource count budget
      const resourceCount = performance.getEntriesByType('resource').length;
      if (resourceCount > 50) {
        violations.push(`Resource count budget exceeded: ${resourceCount} > 50`);
      }
      
      if (violations.length > 0) {
        console.warn('⚠️ Performance budget violations:', violations);
      }
    };
    
    // Check budgets periodically
    setInterval(checkBudgets, 300000); // Check every 5 minutes
  }

  /**
   * Get current bundle size
   */
  private getCurrentBundleSize(): number {
    const scriptEntries = performance.getEntriesByType('resource')
      .filter(entry => entry.name.endsWith('.js'))
      .map(entry => entry as PerformanceResourceTiming);
    
    return Math.round(scriptEntries.reduce((total, entry) => {
      return total + (entry.encodedBodySize || entry.transferSize || 0);
    }, 0) / 1024);
  }

  /**
   * Set up UX monitoring
   */
  private setupUXMonitoring(): void {
    // Monitor for long tasks that might impact user experience
    if ('PerformanceObserver' in window) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach(entry => {
          const longTask = entry as any;
          if (longTask.duration > 50) { // Tasks longer than 50ms
            console.warn(`Long task detected: ${longTask.duration}ms`);
            getRumService().trackCustomMetric('long_task_detected', longTask.duration);
          }
        });
      });
      
      try {
        longTaskObserver.observe({ type: 'longtask', buffered: true });
      } catch (error) {
        console.warn('Long task monitoring not supported:', error);
      }
    }
  }

  /**
   * Validate optimization results
   */
  private async validateOptimizations(): Promise<void> {
    console.log('🔍 Validating optimization results...');
    
    // Wait for measurements to stabilize
    await this.wait(5000);
    
    // Get current performance metrics
    const rumService = getRumService();
    const finalMetrics = rumService.getPerformanceSummary();
    
    // Calculate improvements
    const improvements = this.calculateImprovements(finalMetrics);
    
    // Validate against targets
    const validationResults = this.validateAgainstTargets(finalMetrics);
    
    // Log results
    console.log('📊 Optimization Results:');
    console.log('Improvements:', improvements);
    console.log('Target Validation:', validationResults);
    
    // Track validation metrics
    rumService.trackCustomMetric('optimization_validation_completed', 1, {
      lcp_improvement: improvements.lcp.toString(),
      bundle_size_improvement: improvements.bundleSize.toString(),
      targets_met: validationResults.targetsMet.toString(),
    });
  }

  /**
   * Calculate performance improvements
   */
  private calculateImprovements(finalMetrics: any): any {
    return {
      lcp: Math.max(0, this.currentMetrics.lcp - (finalMetrics.vitals.LCP || this.currentMetrics.lcp)),
      fid: Math.max(0, this.currentMetrics.fid - (finalMetrics.vitals.FID || this.currentMetrics.fid)),
      cls: Math.max(0, this.currentMetrics.cls - (finalMetrics.vitals.CLS || this.currentMetrics.cls)),
      bundleSize: Math.max(0, this.currentMetrics.bundleSize - this.getCurrentBundleSize()),
    };
  }

  /**
   * Validate results against targets
   */
  private validateAgainstTargets(finalMetrics: any): any {
    const results = {
      lcp: (finalMetrics.vitals.LCP || this.currentMetrics.lcp) <= this.targets.lcp,
      fid: (finalMetrics.vitals.FID || this.currentMetrics.fid) <= this.targets.fid,
      cls: (finalMetrics.vitals.CLS || this.currentMetrics.cls) <= this.targets.cls,
      bundleSize: this.getCurrentBundleSize() <= this.targets.bundleSize,
      targetsMet: 0,
      totalTargets: 0,
    };
    
    // Calculate targets met
    const targetResults = [results.lcp, results.fid, results.cls, results.bundleSize];
    results.targetsMet = targetResults.filter(Boolean).length;
    results.totalTargets = targetResults.length;
    
    return results;
  }

  /**
   * Log final optimization results
   */
  private logFinalResults(): void {
    const rumService = getRumService();
    const finalMetrics = rumService.getPerformanceSummary();
    const improvements = this.calculateImprovements(finalMetrics);
    const validationResults = this.validateAgainstTargets(finalMetrics);
    
    console.log(`
🎯 Performance Optimization Results
=====================================

Initial Metrics:
- LCP: ${this.currentMetrics.lcp}ms
- FID: ${this.currentMetrics.fid}ms  
- CLS: ${this.currentMetrics.cls}
- Bundle Size: ${this.currentMetrics.bundleSize}KB

Final Metrics:
- LCP: ${finalMetrics.vitals.LCP || 'N/A'}ms
- FID: ${finalMetrics.vitals.FID || 'N/A'}ms
- CLS: ${finalMetrics.vitals.CLS || 'N/A'}
- Bundle Size: ${this.getCurrentBundleSize()}KB

Improvements:
- LCP: -${improvements.lcp}ms (${improvements.lcp > 0 ? '✅' : '❌'})
- FID: -${improvements.fid}ms (${improvements.fid >= 0 ? '✅' : '❌'})  
- CLS: -${improvements.cls.toFixed(3)} (${improvements.cls >= 0 ? '✅' : '❌'})
- Bundle Size: -${improvements.bundleSize}KB (${improvements.bundleSize > 0 ? '✅' : '❌'})

Targets Met: ${validationResults.targetsMet}/${validationResults.totalTargets}

Total Optimization Time: ${Math.round((Date.now() - this.optimizationStartTime) / 1000)}s
    `);
  }

  /**
   * Subscribe to optimization plan updates
   */
  public subscribe(callback: (plan: OptimizationPlan) => void): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Get current optimization plan
   */
  public getOptimizationPlan(): OptimizationPlan {
    return { ...this.optimizationPlan };
  }

  /**
   * Get current performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    const rumService = getRumService();
    const currentData = rumService.getPerformanceSummary();
    
    const current: PerformanceTargets = {
      lcp: currentData.vitals.LCP || this.currentMetrics.lcp,
      fid: currentData.vitals.FID || this.currentMetrics.fid,
      cls: currentData.vitals.CLS || this.currentMetrics.cls,
      ttfb: currentData.vitals.TTFB || this.currentMetrics.ttfb,
      bundleSize: this.getCurrentBundleSize(),
      mobileLcp: this.currentMetrics.mobileLcp, // Would need mobile-specific measurement
    };
    
    const improvement: PerformanceTargets = {
      lcp: Math.max(0, this.currentMetrics.lcp - current.lcp),
      fid: Math.max(0, this.currentMetrics.fid - current.fid),
      cls: Math.max(0, this.currentMetrics.cls - current.cls),
      ttfb: Math.max(0, this.currentMetrics.ttfb - current.ttfb),
      bundleSize: Math.max(0, this.currentMetrics.bundleSize - current.bundleSize),
      mobileLcp: Math.max(0, this.currentMetrics.mobileLcp - current.mobileLcp),
    };
    
    // Calculate overall performance score (0-100)
    const score = this.calculatePerformanceScore(current);
    
    return {
      current,
      target: this.targets,
      improvement,
      score,
    };
  }

  /**
   * Calculate overall performance score
   */
  private calculatePerformanceScore(metrics: PerformanceTargets): number {
    const scores = {
      lcp: Math.max(0, 100 - (metrics.lcp - this.targets.lcp) / this.targets.lcp * 100),
      fid: Math.max(0, 100 - (metrics.fid - this.targets.fid) / this.targets.fid * 100),
      cls: Math.max(0, 100 - (metrics.cls - this.targets.cls) / this.targets.cls * 100),
      bundleSize: Math.max(0, 100 - (metrics.bundleSize - this.targets.bundleSize) / this.targets.bundleSize * 100),
    };
    
    const weightedScore = (
      scores.lcp * 0.3 +      // LCP is most important
      scores.fid * 0.25 +     // FID is second most important
      scores.cls * 0.25 +     // CLS is third most important
      scores.bundleSize * 0.2 // Bundle size affects all other metrics
    );
    
    return Math.max(0, Math.min(100, Math.round(weightedScore)));
  }

  /**
   * Update optimization plan and notify subscribers
   */
  private updateOptimizationPlan(phase: OptimizationPlan['phase'], currentStep: string): void {
    this.optimizationPlan.phase = phase;
    this.optimizationPlan.currentStep = currentStep;
    this.notifyCallbacks();
  }

  /**
   * Notify all subscribers of plan updates
   */
  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.getOptimizationPlan());
      } catch (error) {
        console.error('Error in optimization plan callback:', error);
      }
    });
  }

  /**
   * Utility method to wait for a specified time
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.callbacks.clear();
    
    // Clean up optimizers
    getCoreWebVitalsOptimizer().cleanup();
    getMobilePerformanceOptimizer().cleanup();
  }
}

// Export singleton instance getter
export function getPerformanceIntegrator(): PerformanceIntegrator {
  return PerformanceIntegrator.getInstance();
}

/**
 * Initialize comprehensive performance optimization
 */
export async function initializePerformanceOptimization(): Promise<void> {
  const integrator = getPerformanceIntegrator();
  await integrator.initialize();
}