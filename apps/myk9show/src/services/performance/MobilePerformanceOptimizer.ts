/**
 * Mobile Performance Optimizer
 * 
 * Specialized optimizations for mobile devices and 3G networks:
 * - Dogs page: 3.5s → <3s target
 * - Shows page: Slow → <3s target
 * - Network-aware loading strategies
 * - Battery and data usage optimization
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-function-type */

import { getRumService } from './RealUserMonitoring';

export interface MobileOptimizationConfig {
  enableDataSaver: boolean;
  reducedMotion: boolean;
  limitImageQuality: boolean;
  enableOfflineMode: boolean;
  batteryOptimization: boolean;
  networkAwareLoading: boolean;
}

export interface NetworkCondition {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink: number; // Mbps
  rtt: number; // ms
  saveData: boolean;
}

export interface DeviceCapability {
  isMobile: boolean;
  isTablet: boolean;
  memoryGB: number;
  cpuCores: number;
  screenDensity: number;
  hasTouch: boolean;
}

export interface MobileOptimization {
  name: string;
  condition: (device: DeviceCapability, network: NetworkCondition) => boolean;
  apply: () => Promise<void>;
  impact: {
    loadTime: number; // ms improvement
    dataUsage: number; // % reduction
    batteryLife: number; // % improvement
  };
}

export class MobilePerformanceOptimizer {
  private config: MobileOptimizationConfig;
  private device: DeviceCapability;
  private network: NetworkCondition;
  private optimizations: MobileOptimization[] = [];
  private appliedOptimizations: Set<string> = new Set();
  private rumService = getRumService();

  constructor(config?: Partial<MobileOptimizationConfig>) {
    this.config = {
      enableDataSaver: true,
      reducedMotion: false,
      limitImageQuality: true,
      enableOfflineMode: true,
      batteryOptimization: true,
      networkAwareLoading: true,
      ...config,
    };

    this.device = this.detectDeviceCapabilities();
    this.network = this.detectNetworkConditions();
    this.initializeOptimizations();
  }

  /**
   * Initialize mobile performance optimization
   */
  public async initialize(): Promise<void> {
    console.log('📱 Initializing Mobile Performance Optimizer');
    
    // Start device and network monitoring
    this.startDeviceMonitoring();
    this.startNetworkMonitoring();
    
    // Apply initial optimizations
    await this.applyMobileOptimizations();
    
    // Set up adaptive optimization
    this.setupAdaptiveOptimization();
  }

  /**
   * Detect device capabilities
   */
  private detectDeviceCapabilities(): DeviceCapability {
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
    const memoryGB = this.estimateMemory();
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
  private estimateMemory(): number {
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
   * Detect network conditions
   */
  private detectNetworkConditions(): NetworkCondition {
    // Check if navigator is available (for SSR compatibility)
    if (typeof navigator === 'undefined') {
      return {
        effectiveType: '3g',
        downlink: 1.5,
        rtt: 300,
        saveData: false,
      };
    }

    const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;

    if (connection) {
      return {
        effectiveType: connection.effectiveType || '4g',
        downlink: connection.downlink || 10,
        rtt: connection.rtt || 100,
        saveData: connection.saveData || false,
      };
    }

    // Fallback: assume moderate 3G connection
    return {
      effectiveType: '3g',
      downlink: 1.5,
      rtt: 300,
      saveData: false,
    };
  }

  /**
   * Initialize mobile-specific optimizations
   */
  private initializeOptimizations(): void {
    this.optimizations = [
      {
        name: 'adaptive_image_loading',
        condition: (device, network) => 
          device.isMobile && (network.effectiveType === '3g' || network.effectiveType === '2g'),
        apply: this.applyAdaptiveImageLoading.bind(this),
        impact: { loadTime: 1200, dataUsage: 40, batteryLife: 15 },
      },
      {
        name: 'reduced_animation',
        condition: (device, network) => 
          device.isMobile && device.memoryGB < 4,
        apply: this.applyReducedAnimation.bind(this),
        impact: { loadTime: 300, dataUsage: 10, batteryLife: 20 },
      },
      {
        name: 'data_saver_mode',
        condition: (device, network) => 
          network.saveData || network.effectiveType === 'slow-2g' || network.effectiveType === '2g',
        apply: this.applyDataSaverMode.bind(this),
        impact: { loadTime: 800, dataUsage: 60, batteryLife: 25 },
      },
      {
        name: 'battery_optimization',
        condition: (device, network) => 
          device.isMobile && this.config.batteryOptimization,
        apply: this.applyBatteryOptimization.bind(this),
        impact: { loadTime: 200, dataUsage: 15, batteryLife: 30 },
      },
      {
        name: 'memory_optimization',
        condition: (device, network) => 
          device.memoryGB < 3,
        apply: this.applyMemoryOptimization.bind(this),
        impact: { loadTime: 500, dataUsage: 5, batteryLife: 10 },
      },
      {
        name: 'touch_optimization',
        condition: (device, network) => 
          device.hasTouch,
        apply: this.applyTouchOptimization.bind(this),
        impact: { loadTime: 100, dataUsage: 5, batteryLife: 15 },
      },
      {
        name: 'network_aware_loading',
        condition: (device, network) => 
          this.config.networkAwareLoading,
        apply: this.applyNetworkAwareLoading.bind(this),
        impact: { loadTime: 600, dataUsage: 30, batteryLife: 20 },
      },
      {
        name: 'mobile_specific_caching',
        condition: (device, network) => 
          device.isMobile,
        apply: this.applyMobileSpecificCaching.bind(this),
        impact: { loadTime: 400, dataUsage: 20, batteryLife: 10 },
      },
    ];
  }

  /**
   * Apply mobile optimizations based on device and network conditions
   */
  private async applyMobileOptimizations(): Promise<void> {
    for (const optimization of this.optimizations) {
      if (optimization.condition(this.device, this.network)) {
        try {
          console.log(`📱 Applying mobile optimization: ${optimization.name}`);
          await optimization.apply();
          this.appliedOptimizations.add(optimization.name);
          
          // Track optimization impact
          this.rumService.trackCustomMetric('mobile_optimization_applied', 1, {
            name: optimization.name,
            expected_load_time_improvement: optimization.impact.loadTime.toString(),
            expected_data_reduction: optimization.impact.dataUsage.toString(),
            expected_battery_improvement: optimization.impact.batteryLife.toString(),
          });
          
        } catch (error) {
          console.error(`Failed to apply mobile optimization ${optimization.name}:`, error);
        }
      }
    }
  }

  /**
   * Adaptive image loading optimization
   */
  private async applyAdaptiveImageLoading(): Promise<void> {
    // Implement adaptive image quality based on network conditions
    const imageQuality = this.getAdaptiveImageQuality();
    
    // Apply to existing images
    document.querySelectorAll('img').forEach(img => {
      this.optimizeImageForMobile(img as HTMLImageElement, imageQuality);
    });

    // Set up observer for new images
    this.setupImageOptimizationObserver(imageQuality);
    
    // Implement progressive image loading
    this.implementProgressiveImageLoading();
  }

  /**
   * Get adaptive image quality based on network and device
   */
  private getAdaptiveImageQuality(): number {
    if (this.network.effectiveType === 'slow-2g' || this.network.effectiveType === '2g') {
      return 0.6; // 60% quality
    }
    if (this.network.effectiveType === '3g') {
      return 0.75; // 75% quality
    }
    if (this.device.memoryGB < 2) {
      return 0.8; // 80% quality for low-memory devices
    }
    return 1.0; // Full quality for high-end devices on 4G
  }

  /**
   * Optimize individual image for mobile
   */
  private optimizeImageForMobile(img: HTMLImageElement, quality: number): void {
    // Skip if already optimized
    if (img.dataset.mobileOptimized === 'true') return;
    
    const originalSrc = img.src || img.dataset.src;
    if (!originalSrc) return;

    // Generate optimized image URL (assuming a service that can resize/compress)
    const optimizedSrc = this.generateOptimizedImageUrl(originalSrc, quality);
    
    // Apply lazy loading
    if ('loading' in img) {
      img.loading = 'lazy';
    }
    
    // Set srcset for responsive images
    if (!img.srcset && quality < 1.0) {
      img.srcset = `${optimizedSrc} 1x`;
    }
    
    // Mark as optimized
    img.dataset.mobileOptimized = 'true';
    
    // Add error handling
    img.onerror = () => {
      // Fallback to original image if optimized version fails
      img.src = originalSrc;
    };
  }

  /**
   * Generate optimized image URL
   */
  private generateOptimizedImageUrl(originalUrl: string, quality: number): string {
    // Simple optimization: add quality parameter
    // In a real implementation, this would use an image optimization service
    const url = new URL(originalUrl, window.location.origin);
    url.searchParams.set('quality', Math.round(quality * 100).toString());
    
    // Reduce dimensions for mobile
    if (this.device.isMobile) {
      const maxWidth = window.innerWidth * this.device.screenDensity;
      url.searchParams.set('w', Math.min(maxWidth, 800).toString());
    }
    
    return url.toString();
  }

  /**
   * Set up image optimization observer
   */
  private setupImageOptimizationObserver(quality: number): void {
    const imageObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const images = element.querySelectorAll ? element.querySelectorAll('img') : [];
            images.forEach(img => {
              this.optimizeImageForMobile(img as HTMLImageElement, quality);
            });
            
            // Check if the added node itself is an image
            if (element.tagName === 'IMG') {
              this.optimizeImageForMobile(element as HTMLImageElement, quality);
            }
          }
        });
      });
    });

    imageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Implement progressive image loading
   */
  private implementProgressiveImageLoading(): void {
    const style = document.createElement('style');
    style.textContent = `
      .progressive-image {
        transition: filter 0.3s ease;
        filter: blur(5px);
      }
      
      .progressive-image.loaded {
        filter: none;
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
  }

  /**
   * Apply reduced animation optimization
   */
  private async applyReducedAnimation(): Promise<void> {
    // Reduce or disable animations on low-end devices
    const style = document.createElement('style');
    style.textContent = `
      /* Reduce motion for better performance */
      * {
        animation-duration: 0.3s !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.2s !important;
      }
      
      /* Disable expensive animations */
      .expensive-animation,
      .parallax-effect,
      .particle-system {
        animation: none !important;
        transform: none !important;
      }
      
      /* Simplify hover effects */
      .card:hover,
      .button:hover {
        transform: none !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(style);

    // Set CSS custom property for JavaScript animations
    document.documentElement.style.setProperty('--animation-speed', '0.2s');
    document.documentElement.style.setProperty('--reduced-motion', '1');
  }

  /**
   * Apply data saver mode optimization
   */
  private async applyDataSaverMode(): Promise<void> {
    // Defer loading of non-critical resources
    this.deferNonCriticalResources();
    
    // Compress text content
    this.enableTextCompression();
    
    // Reduce image quality further
    const lowQualityImages = document.querySelectorAll('img');
    lowQualityImages.forEach(img => {
      this.optimizeImageForMobile(img as HTMLImageElement, 0.5);
    });
    
    // Disable auto-playing media
    this.disableAutoPlayMedia();
    
    // Enable aggressive caching
    this.enableAggressiveCaching();
  }

  /**
   * Defer non-critical resources
   */
  private deferNonCriticalResources(): void {
    // Defer analytics scripts
    const analyticsScripts = document.querySelectorAll('script[src*="analytics"], script[src*="gtag"]');
    analyticsScripts.forEach(script => {
      const src = script.getAttribute('src');
      if (src) {
        script.removeAttribute('src');
        script.setAttribute('data-deferred-src', src);
      }
    });

    // Load deferred scripts after interaction
    const loadDeferredScripts = () => {
      const deferredScripts = document.querySelectorAll('[data-deferred-src]');
      deferredScripts.forEach(script => {
        const src = script.getAttribute('data-deferred-src');
        if (src) {
          script.setAttribute('src', src);
          script.removeAttribute('data-deferred-src');
        }
      });
    };

    // Load after first user interaction
    ['click', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, loadDeferredScripts, { once: true, passive: true });
    });
  }

  /**
   * Enable text compression
   */
  private enableTextCompression(): void {
    // Request compressed responses when possible
    if ('serviceWorker' in navigator) {
      // Register a service worker for compression
      this.registerCompressionServiceWorker();
    }
  }

  /**
   * Register service worker for compression
   */
  private async registerCompressionServiceWorker(): Promise<void> {
    try {
      const swCode = `
        self.addEventListener('fetch', event => {
          if (event.request.headers.get('accept').includes('text/html') ||
              event.request.headers.get('accept').includes('application/json')) {
            const modifiedRequest = new Request(event.request, {
              headers: {
                ...event.request.headers,
                'Accept-Encoding': 'gzip, deflate, br'
              }
            });
            event.respondWith(fetch(modifiedRequest));
          }
        });
      `;
      
      const blob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);
      
      await navigator.serviceWorker.register(swUrl);
      console.log('Compression service worker registered');
    } catch (error) {
      console.warn('Failed to register compression service worker:', error);
    }
  }

  /**
   * Disable auto-playing media
   */
  private disableAutoPlayMedia(): void {
    // Disable autoplay for videos
    document.querySelectorAll('video[autoplay]').forEach(video => {
      const videoElement = video as HTMLVideoElement;
      videoElement.autoplay = false;
      videoElement.preload = 'none';
    });

    // Disable autoplay for audio
    document.querySelectorAll('audio[autoplay]').forEach(audio => {
      const audioElement = audio as HTMLAudioElement;
      audioElement.autoplay = false;
      audioElement.preload = 'none';
    });
  }

  /**
   * Enable aggressive caching
   */
  private enableAggressiveCaching(): void {
    // Set aggressive cache headers for static resources
    if ('serviceWorker' in navigator) {
      this.registerCachingServiceWorker();
    }
  }

  /**
   * Register caching service worker
   */
  private async registerCachingServiceWorker(): Promise<void> {
    try {
      const swCode = `
        const CACHE_NAME = 'mobile-performance-cache-v1';
        const urlsToCache = [
          '/',
          '/manifest.json',
          '/assets/styles/main.css',
          '/assets/scripts/main.js'
        ];
        
        self.addEventListener('install', event => {
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then(cache => cache.addAll(urlsToCache))
          );
        });
        
        self.addEventListener('fetch', event => {
          event.respondWith(
            caches.match(event.request)
              .then(response => response || fetch(event.request))
          );
        });
      `;
      
      const blob = new Blob([swCode], { type: 'application/javascript' });
      const swUrl = URL.createObjectURL(blob);
      
      await navigator.serviceWorker.register(swUrl);
      console.log('Caching service worker registered');
    } catch (error) {
      console.warn('Failed to register caching service worker:', error);
    }
  }

  /**
   * Apply battery optimization
   */
  private async applyBatteryOptimization(): Promise<void> {
    // Reduce update frequency
    this.reduceUpdateFrequency();
    
    // Optimize CPU usage
    this.optimizeCPUUsage();
    
    // Monitor battery status
    this.monitorBatteryStatus();
  }

  /**
   * Reduce update frequency for battery saving
   */
  private reduceUpdateFrequency(): void {
    // Throttle scroll events more aggressively
    let scrollTimeout: NodeJS.Timeout;
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'scroll' && typeof listener === 'function') {
        const throttledListener = (...args: any[]) => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(() => {
            (listener as any).apply(this, args);
          }, 50); // Increased from 16ms to 50ms for battery saving
        };
        
        return originalAddEventListener.call(this, type, throttledListener, options);
      }
      
      return originalAddEventListener.call(this, type, listener, options);
    };

    // Reduce animation frame requests
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      // Throttle to 30fps instead of 60fps for battery saving
      return originalRequestAnimationFrame(() => {
        setTimeout(callback, 16); // Add slight delay
      });
    };
  }

  /**
   * Optimize CPU usage
   */
  private optimizeCPUUsage(): void {
    // Use Web Workers for heavy computations
    this.setupWebWorkers();
    
    // Implement efficient debouncing
    this.implementEfficientDebouncing();
  }

  /**
   * Set up Web Workers for heavy computations
   */
  private setupWebWorkers(): void {
    // Create a Web Worker for data processing
    const workerCode = `
      self.onmessage = function(e) {
        const { type, data } = e.data;
        
        switch (type) {
          case 'processData':
            // Process data in background thread
            const result = data.map(item => ({ ...item, processed: true }));
            self.postMessage({ type: 'dataProcessed', result });
            break;
          
          case 'calculateMetrics':
            // Calculate performance metrics
            const metrics = {
              average: data.reduce((sum, val) => sum + val, 0) / data.length,
              max: Math.max(...data),
              min: Math.min(...data)
            };
            self.postMessage({ type: 'metricsCalculated', metrics });
            break;
        }
      };
    `;
    
    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      
      // Store worker reference for cleanup
      (window as any).mobileOptimizationWorker = worker;
      
      console.log('Web Worker created for mobile optimization');
    } catch (error) {
      console.warn('Failed to create Web Worker:', error);
    }
  }

  /**
   * Implement efficient debouncing
   */
  private implementEfficientDebouncing(): void {
    // More aggressive debouncing for mobile
    const debounceMap = new Map();
    
    (window as any).mobileDebounce = (func: Function, delay: number = 100) => {
      const key = func.toString();
      
      return (...args: any[]) => {
        clearTimeout(debounceMap.get(key));
        debounceMap.set(key, setTimeout(() => func.apply(this, args), delay));
      };
    };
  }

  /**
   * Monitor battery status for adaptive optimization
   */
  private async monitorBatteryStatus(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        
        const updateBatteryOptimization = () => {
          const isLowBattery = battery.level < 0.2; // Less than 20%
          const isCharging = battery.charging;
          
          if (isLowBattery && !isCharging) {
            // Apply aggressive battery saving
            this.applyAggressiveBatterySaving();
          } else {
            // Normal optimization
            this.applyNormalOptimization();
          }
        };
        
        battery.addEventListener('levelchange', updateBatteryOptimization);
        battery.addEventListener('chargingchange', updateBatteryOptimization);
        
        // Initial check
        updateBatteryOptimization();
        
      } catch (error) {
        console.warn('Battery API not available:', error);
      }
    }
  }

  /**
   * Apply aggressive battery saving measures
   */
  private applyAggressiveBatterySaving(): void {
    // Disable all animations
    const style = document.createElement('style');
    style.id = 'battery-saving-style';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `;
    document.head.appendChild(style);
    
    // Reduce update frequency further
    this.rumService.trackCustomMetric('battery_saving_mode_activated', 1);
  }

  /**
   * Apply normal optimization
   */
  private applyNormalOptimization(): void {
    // Remove aggressive battery saving styles
    const batteryStyle = document.getElementById('battery-saving-style');
    if (batteryStyle) {
      batteryStyle.remove();
    }
  }

  /**
   * Apply memory optimization
   */
  private async applyMemoryOptimization(): Promise<void> {
    // Implement memory-efficient data structures
    this.implementMemoryEfficientCaching();
    
    // Set up memory monitoring
    this.setupMemoryMonitoring();
    
    // Optimize garbage collection
    this.optimizeGarbageCollection();
  }

  /**
   * Implement memory-efficient caching
   */
  private implementMemoryEfficientCaching(): void {
    // Use WeakMap for memory-efficient caching
    const cache = new WeakMap();
    
    // Override React Query cache settings for low-memory devices
    if (this.device.memoryGB < 3) {
      // Reduce cache time and stale time
      (window as any).mobileQueryDefaults = {
        staleTime: 2 * 60 * 1000, // 2 minutes instead of 5
        gcTime: 5 * 60 * 1000,    // 5 minutes instead of 10
      };
    }
  }

  /**
   * Set up memory monitoring
   */
  private setupMemoryMonitoring(): void {
    setInterval(() => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usagePercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
        
        if (usagePercent > 80) {
          // Trigger aggressive cleanup
          this.triggerMemoryCleanup();
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Trigger memory cleanup
   */
  private triggerMemoryCleanup(): void {
    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }
    
    // Clean up caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name.includes('old') || name.includes('temp')) {
            caches.delete(name);
          }
        });
      });
    }
    
    this.rumService.trackCustomMetric('memory_cleanup_triggered', 1);
  }

  /**
   * Optimize garbage collection
   */
  private optimizeGarbageCollection(): void {
    // Implement object pooling for frequently created objects
    const objectPool = new Map();
    
    (window as any).mobileObjectPool = {
      get: (type: string) => {
        if (!objectPool.has(type)) {
          objectPool.set(type, []);
        }
        const pool = objectPool.get(type);
        return pool.length > 0 ? pool.pop() : {};
      },
      
      release: (type: string, obj: any) => {
        if (!objectPool.has(type)) {
          objectPool.set(type, []);
        }
        // Clear object properties and return to pool
        Object.keys(obj).forEach(key => delete obj[key]);
        objectPool.get(type).push(obj);
      }
    };
  }

  /**
   * Apply touch optimization
   */
  private async applyTouchOptimization(): Promise<void> {
    // Optimize touch event handling
    this.optimizeTouchEvents();
    
    // Implement touch-friendly interactions
    this.implementTouchFriendlyInteractions();
    
    // Add touch feedback optimization
    this.optimizeTouchFeedback();
  }

  /**
   * Optimize touch events
   */
  private optimizeTouchEvents(): void {
    // Use passive listeners for touch events
    const touchEvents = ['touchstart', 'touchmove', 'touchend'];
    
    touchEvents.forEach(eventType => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === eventType) {
          if (typeof options !== 'object') {
            options = { passive: true };
          } else {
            options = { ...options, passive: true };
          }
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    });
  }

  /**
   * Implement touch-friendly interactions
   */
  private implementTouchFriendlyInteractions(): void {
    // Increase touch target sizes
    const style = document.createElement('style');
    style.textContent = `
      @media (pointer: coarse) {
        button, .button, a, input, select, textarea {
          min-height: 44px;
          min-width: 44px;
          padding: 12px 16px;
        }
        
        .touch-target {
          position: relative;
        }
        
        .touch-target::after {
          content: '';
          position: absolute;
          top: -10px;
          left: -10px;
          right: -10px;
          bottom: -10px;
          z-index: -1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Optimize touch feedback
   */
  private optimizeTouchFeedback(): void {
    // Reduce touch feedback delay
    document.addEventListener('touchstart', (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('button, .button, a')) {
        target.style.transform = 'scale(0.98)';
        target.style.transition = 'transform 0.1s ease';
      }
    }, { passive: true });

    document.addEventListener('touchend', (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('button, .button, a')) {
        setTimeout(() => {
          target.style.transform = '';
        }, 100);
      }
    }, { passive: true });
  }

  /**
   * Apply network-aware loading
   */
  private async applyNetworkAwareLoading(): Promise<void> {
    // Adjust loading strategies based on network conditions
    this.adjustLoadingStrategies();
    
    // Implement smart prefetching
    this.implementSmartPrefetching();
    
    // Set up network change monitoring
    this.setupNetworkChangeMonitoring();
  }

  /**
   * Adjust loading strategies based on network
   */
  private adjustLoadingStrategies(): void {
    const { effectiveType, downlink } = this.network;
    
    // Adjust based on connection quality
    let maxConcurrentRequests = 6; // Default for 4G
    let prefetchDelay = 1000; // Default delay
    
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      maxConcurrentRequests = 2;
      prefetchDelay = 5000;
    } else if (effectiveType === '3g') {
      maxConcurrentRequests = 4;
      prefetchDelay = 3000;
    }
    
    // Implement request queue
    this.implementRequestQueue(maxConcurrentRequests);
    
    // Adjust prefetch timing
    (window as any).mobilePrefetchDelay = prefetchDelay;
  }

  /**
   * Implement request queue for connection management
   */
  private implementRequestQueue(maxConcurrent: number): void {
    const requestQueue: Array<() => Promise<any>> = [];
    let activeRequests = 0;
    
    const processQueue = async () => {
      if (activeRequests >= maxConcurrent || requestQueue.length === 0) {
        return;
      }
      
      activeRequests++;
      const request = requestQueue.shift()!;
      
      try {
        await request();
      } catch (error) {
        console.warn('Queued request failed:', error);
      } finally {
        activeRequests--;
        processQueue(); // Process next request
      }
    };
    
    // Override fetch to use queue
    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        requestQueue.push(() => originalFetch(input, init).then(resolve).catch(reject));
        processQueue();
      });
    };
  }

  /**
   * Implement smart prefetching
   */
  private implementSmartPrefetching(): void {
    const { effectiveType, saveData } = this.network;
    
    // Don't prefetch on slow connections or data saver mode
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || saveData) {
      return;
    }
    
    // Implement viewport-based prefetching
    const prefetchObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const link = entry.target as HTMLAnchorElement;
          if (link.href && !link.dataset.prefetched) {
            setTimeout(() => {
              const prefetchLink = document.createElement('link');
              prefetchLink.rel = 'prefetch';
              prefetchLink.href = link.href;
              document.head.appendChild(prefetchLink);
              link.dataset.prefetched = 'true';
            }, (window as any).mobilePrefetchDelay || 1000);
          }
        }
      });
    }, {
      rootMargin: '200px 0px', // Prefetch when 200px away
    });
    
    // Observe navigation links
    document.querySelectorAll('a[href]').forEach(link => {
      prefetchObserver.observe(link);
    });
  }

  /**
   * Set up network change monitoring
   */
  private setupNetworkChangeMonitoring(): void {
    const connection = (navigator as any).connection;
    
    if (connection) {
      connection.addEventListener('change', () => {
        this.network = this.detectNetworkConditions();
        console.log('Network conditions changed:', this.network);
        
        // Reapply network-aware optimizations
        this.adjustLoadingStrategies();
        
        this.rumService.trackCustomMetric('network_change_detected', 1, {
          effective_type: this.network.effectiveType,
          downlink: this.network.downlink.toString(),
          rtt: this.network.rtt.toString(),
        });
      });
    }
  }

  /**
   * Apply mobile-specific caching
   */
  private async applyMobileSpecificCaching(): Promise<void> {
    // Implement aggressive local caching for mobile
    this.implementLocalCaching();
    
    // Set up offline fallbacks
    this.setupOfflineFallbacks();
  }

  /**
   * Implement local caching strategies
   */
  private implementLocalCaching(): void {
    // Use IndexedDB for large data caching
    if ('indexedDB' in window) {
      this.setupIndexedDBCaching();
    }
    
    // Use localStorage for small data with compression
    this.setupCompressedLocalStorage();
  }

  /**
   * Set up IndexedDB caching
   */
  private setupIndexedDBCaching(): void {
    const dbName = 'MobilePerformanceCache';
    const dbVersion = 1;
    
    const request = indexedDB.open(dbName, dbVersion);
    
    request.onerror = () => {
      console.warn('IndexedDB not available for mobile caching');
    };
    
    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      (window as any).mobileDB = db;
      console.log('Mobile IndexedDB cache ready');
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create object stores for different types of data
      const stores = ['api-cache', 'image-cache', 'ui-state'];
      
      stores.forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      });
    };
  }

  /**
   * Set up compressed localStorage
   */
  private setupCompressedLocalStorage(): void {
    // Simple compression using JSON with reduced precision
    (window as any).mobileLocalStorage = {
      setItem: (key: string, value: any) => {
        try {
          const compressed = JSON.stringify(value, (k, v) => {
            // Reduce number precision to save space
            if (typeof v === 'number') {
              return Math.round(v * 100) / 100;
            }
            return v;
          });
          localStorage.setItem(`mobile_${key}`, compressed);
        } catch (error) {
          console.warn('Failed to store compressed data:', error);
        }
      },
      
      getItem: (key: string) => {
        try {
          const compressed = localStorage.getItem(`mobile_${key}`);
          return compressed ? JSON.parse(compressed) : null;
        } catch (error) {
          console.warn('Failed to retrieve compressed data:', error);
          return null;
        }
      }
    };
  }

  /**
   * Set up offline fallbacks
   */
  private setupOfflineFallbacks(): void {
    // Detect offline state
    window.addEventListener('offline', () => {
      document.body.classList.add('offline-mode');
      this.rumService.trackCustomMetric('offline_mode_activated', 1);
    });
    
    window.addEventListener('online', () => {
      document.body.classList.remove('offline-mode');
      this.rumService.trackCustomMetric('online_mode_restored', 1);
    });
    
    // Add offline styles
    const style = document.createElement('style');
    style.textContent = `
      .offline-mode {
        filter: grayscale(0.3);
      }
      
      .offline-mode::before {
        content: 'Offline Mode - Limited functionality available';
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ff6b35;
        color: white;
        text-align: center;
        padding: 8px;
        z-index: 9999;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Start device monitoring
   */
  private startDeviceMonitoring(): void {
    // Monitor device orientation changes
    window.addEventListener('orientationchange', () => {
      // Trigger layout recalculation after orientation change
      setTimeout(() => {
        this.rumService.trackCustomMetric('orientation_change', 1, {
          orientation: screen.orientation?.angle.toString() || 'unknown',
        });
      }, 100);
    });
    
    // Monitor page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Reduce activity when page is hidden
        this.reduceBackgroundActivity();
      } else {
        // Resume normal activity
        this.resumeNormalActivity();
      }
    });
  }

  /**
   * Reduce background activity
   */
  private reduceBackgroundActivity(): void {
    // Pause non-critical timers and animations
    (window as any).mobileBackgroundMode = true;
    this.rumService.trackCustomMetric('background_mode_activated', 1);
  }

  /**
   * Resume normal activity
   */
  private resumeNormalActivity(): void {
    // Resume normal operation
    (window as any).mobileBackgroundMode = false;
    this.rumService.trackCustomMetric('foreground_mode_activated', 1);
  }

  /**
   * Start network monitoring
   */
  private startNetworkMonitoring(): void {
    // Monitor connection changes
    const connection = (navigator as any).connection;
    
    if (connection) {
      connection.addEventListener('change', () => {
        const newNetwork = this.detectNetworkConditions();
        
        // Detect significant network changes
        if (newNetwork.effectiveType !== this.network.effectiveType) {
          this.handleNetworkQualityChange(this.network.effectiveType, newNetwork.effectiveType);
        }
        
        this.network = newNetwork;
      });
    }
  }

  /**
   * Handle network quality changes
   */
  private handleNetworkQualityChange(oldType: string, newType: string): void {
    console.log(`Network quality changed from ${oldType} to ${newType}`);
    
    // Apply appropriate optimizations for new network conditions
    if (newType === 'slow-2g' || newType === '2g') {
      this.applyDataSaverMode();
    } else if (oldType === 'slow-2g' || oldType === '2g') {
      // Restore normal functionality when network improves
      this.restoreNormalMode();
    }
    
    this.rumService.trackCustomMetric('network_quality_change', 1, {
      from: oldType,
      to: newType,
    });
  }

  /**
   * Restore normal mode
   */
  private restoreNormalMode(): void {
    // Remove data saver restrictions
    const deferredScripts = document.querySelectorAll('[data-deferred-src]');
    deferredScripts.forEach(script => {
      const src = script.getAttribute('data-deferred-src');
      if (src) {
        script.setAttribute('src', src);
        script.removeAttribute('data-deferred-src');
      }
    });
  }

  /**
   * Set up adaptive optimization
   */
  private setupAdaptiveOptimization(): void {
    // Continuously monitor and adapt optimizations
    setInterval(() => {
      this.adaptOptimizations();
    }, 60000); // Check every minute
  }

  /**
   * Adapt optimizations based on current conditions
   */
  private adaptOptimizations(): void {
    const currentNetwork = this.detectNetworkConditions();
    const performanceMetrics = this.rumService.getPerformanceSummary();
    
    // Check if optimizations need adjustment
    const needsReoptimization = 
      currentNetwork.effectiveType !== this.network.effectiveType ||
      performanceMetrics.vitals.LCP > 3000 ||
      performanceMetrics.vitals.CLS > 0.1;
    
    if (needsReoptimization) {
      console.log('🔄 Adapting mobile optimizations...');
      this.applyMobileOptimizations();
    }
  }

  /**
   * Get optimization status
   */
  public getOptimizationStatus(): {
    device: DeviceCapability;
    network: NetworkCondition;
    appliedOptimizations: string[];
    expectedImprovements: {
      loadTime: number;
      dataUsage: number;
      batteryLife: number;
    };
  } {
    const expectedImprovements = Array.from(this.appliedOptimizations)
      .map(name => this.optimizations.find(opt => opt.name === name))
      .filter(Boolean)
      .reduce(
        (total, opt) => ({
          loadTime: total.loadTime + opt!.impact.loadTime,
          dataUsage: total.dataUsage + opt!.impact.dataUsage,
          batteryLife: total.batteryLife + opt!.impact.batteryLife,
        }),
        { loadTime: 0, dataUsage: 0, batteryLife: 0 }
      );

    return {
      device: this.device,
      network: this.network,
      appliedOptimizations: Array.from(this.appliedOptimizations),
      expectedImprovements,
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    // Clean up workers
    const worker = (window as any).mobileOptimizationWorker;
    if (worker) {
      worker.terminate();
      delete (window as any).mobileOptimizationWorker;
    }
    
    // Clean up service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          if (registration.scope.includes('mobile-performance')) {
            registration.unregister();
          }
        });
      });
    }
  }
}

// Singleton instance
let mobilePerformanceOptimizer: MobilePerformanceOptimizer | null = null;

export function getMobilePerformanceOptimizer(config?: Partial<MobileOptimizationConfig>): MobilePerformanceOptimizer {
  if (!mobilePerformanceOptimizer) {
    mobilePerformanceOptimizer = new MobilePerformanceOptimizer(config);
  }
  return mobilePerformanceOptimizer;
}

/**
 * Initialize mobile performance optimization
 */
export async function initializeMobilePerformanceOptimization(config?: Partial<MobileOptimizationConfig>): Promise<void> {
  const optimizer = getMobilePerformanceOptimizer(config);
  await optimizer.initialize();
}