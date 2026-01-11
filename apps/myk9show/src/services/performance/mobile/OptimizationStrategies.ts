/**
 * Mobile Optimization Strategies
 *
 * Individual optimization implementations for mobile devices.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DeviceCapability, NetworkCondition, MobileOptimization } from './types';
import { getRumService } from '../RealUserMonitoring';

// =============================================================================
// Image Optimization
// =============================================================================

/**
 * Get adaptive image quality based on network and device
 */
export function getAdaptiveImageQuality(device: DeviceCapability, network: NetworkCondition): number {
  if (network.effectiveType === 'slow-2g' || network.effectiveType === '2g') {
    return 0.6; // 60% quality
  }
  if (network.effectiveType === '3g') {
    return 0.75; // 75% quality
  }
  if (device.memoryGB < 2) {
    return 0.8; // 80% quality for low-memory devices
  }
  return 1.0; // Full quality for high-end devices on 4G
}

/**
 * Generate optimized image URL
 */
function generateOptimizedImageUrl(originalUrl: string, quality: number, device: DeviceCapability): string {
  const url = new URL(originalUrl, window.location.origin);
  url.searchParams.set('quality', Math.round(quality * 100).toString());

  // Reduce dimensions for mobile
  if (device.isMobile) {
    const maxWidth = window.innerWidth * device.screenDensity;
    url.searchParams.set('w', Math.min(maxWidth, 800).toString());
  }

  return url.toString();
}

/**
 * Optimize individual image for mobile
 */
function optimizeImageForMobile(img: HTMLImageElement, quality: number, device: DeviceCapability): void {
  // Skip if already optimized
  if (img.dataset.mobileOptimized === 'true') return;

  const originalSrc = img.src || img.dataset.src;
  if (!originalSrc) return;

  // Generate optimized image URL
  const optimizedSrc = generateOptimizedImageUrl(originalSrc, quality, device);

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
 * Set up image optimization observer
 */
function setupImageOptimizationObserver(quality: number, device: DeviceCapability): void {
  const imageObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          const images = element.querySelectorAll ? element.querySelectorAll('img') : [];
          images.forEach(img => {
            optimizeImageForMobile(img as HTMLImageElement, quality, device);
          });

          // Check if the added node itself is an image
          if (element.tagName === 'IMG') {
            optimizeImageForMobile(element as HTMLImageElement, quality, device);
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
 * Implement progressive image loading styles
 */
function implementProgressiveImageLoading(): void {
  const style = document.createElement('style');
  style.id = 'progressive-image-styles';
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
 * Apply adaptive image loading optimization
 */
export async function applyAdaptiveImageLoading(device: DeviceCapability, network: NetworkCondition): Promise<void> {
  const imageQuality = getAdaptiveImageQuality(device, network);

  // Apply to existing images
  document.querySelectorAll('img').forEach(img => {
    optimizeImageForMobile(img as HTMLImageElement, imageQuality, device);
  });

  // Set up observer for new images
  setupImageOptimizationObserver(imageQuality, device);

  // Implement progressive image loading
  implementProgressiveImageLoading();
}

// =============================================================================
// Animation Optimization
// =============================================================================

/**
 * Apply reduced animation optimization
 */
export async function applyReducedAnimation(): Promise<void> {
  const style = document.createElement('style');
  style.id = 'reduced-animation-styles';
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

// =============================================================================
// Data Saver Optimization
// =============================================================================

/**
 * Defer non-critical resources
 */
function deferNonCriticalResources(): void {
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
 * Disable auto-playing media
 */
function disableAutoPlayMedia(): void {
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
 * Apply data saver mode optimization
 */
export async function applyDataSaverMode(device: DeviceCapability): Promise<void> {
  // Defer loading of non-critical resources
  deferNonCriticalResources();

  // Reduce image quality further
  const lowQualityImages = document.querySelectorAll('img');
  lowQualityImages.forEach(img => {
    optimizeImageForMobile(img as HTMLImageElement, 0.5, device);
  });

  // Disable auto-playing media
  disableAutoPlayMedia();
}

// =============================================================================
// Battery Optimization
// =============================================================================

/**
 * Apply aggressive battery saving measures
 */
export function applyAggressiveBatterySaving(): void {
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

  getRumService().trackCustomMetric('battery_saving_mode_activated', 1);
}

/**
 * Remove aggressive battery saving
 */
export function removeAggressiveBatterySaving(): void {
  const batteryStyle = document.getElementById('battery-saving-style');
  if (batteryStyle) {
    batteryStyle.remove();
  }
}

/**
 * Set up Web Workers for heavy computations
 */
function setupWebWorkers(): void {
  const workerCode = `
    self.onmessage = function(e) {
      const { type, data } = e.data;

      switch (type) {
        case 'processData':
          const result = data.map(item => ({ ...item, processed: true }));
          self.postMessage({ type: 'dataProcessed', result });
          break;

        case 'calculateMetrics':
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
    (window as any).mobileOptimizationWorker = worker;
  } catch (error) {
    console.warn('Failed to create Web Worker:', error);
  }
}

/**
 * Monitor battery status for adaptive optimization
 */
export async function monitorBatteryStatus(
  onLowBattery: () => void,
  onNormalBattery: () => void
): Promise<void> {
  if ('getBattery' in navigator) {
    try {
      const battery = await (navigator as any).getBattery();

      const updateBatteryOptimization = () => {
        const isLowBattery = battery.level < 0.2;
        const isCharging = battery.charging;

        if (isLowBattery && !isCharging) {
          onLowBattery();
        } else {
          onNormalBattery();
        }
      };

      battery.addEventListener('levelchange', updateBatteryOptimization);
      battery.addEventListener('chargingchange', updateBatteryOptimization);
      updateBatteryOptimization();
    } catch (error) {
      console.warn('Battery API not available:', error);
    }
  }
}

/**
 * Apply battery optimization
 */
export async function applyBatteryOptimization(): Promise<void> {
  // Set up Web Workers for heavy computations
  setupWebWorkers();

  // Monitor battery status
  await monitorBatteryStatus(
    () => applyAggressiveBatterySaving(),
    () => removeAggressiveBatterySaving()
  );
}

// =============================================================================
// Memory Optimization
// =============================================================================

/**
 * Trigger memory cleanup
 */
export function triggerMemoryCleanup(): void {
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

  getRumService().trackCustomMetric('memory_cleanup_triggered', 1);
}

/**
 * Set up memory monitoring
 */
function setupMemoryMonitoring(): void {
  setInterval(() => {
    if ('memory' in performance) {
      const memInfo = (performance as any).memory;
      const usagePercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;

      if (usagePercent > 80) {
        triggerMemoryCleanup();
      }
    }
  }, 30000);
}

/**
 * Apply memory optimization
 */
export async function applyMemoryOptimization(device: DeviceCapability): Promise<void> {
  // Override React Query cache settings for low-memory devices
  if (device.memoryGB < 3) {
    (window as any).mobileQueryDefaults = {
      staleTime: 2 * 60 * 1000, // 2 minutes instead of 5
      gcTime: 5 * 60 * 1000,    // 5 minutes instead of 10
    };
  }

  // Set up memory monitoring
  setupMemoryMonitoring();
}

// =============================================================================
// Touch Optimization
// =============================================================================

/**
 * Apply touch optimization
 */
export async function applyTouchOptimization(): Promise<void> {
  // Add touch-friendly styles
  const style = document.createElement('style');
  style.id = 'touch-optimization-styles';
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

  // Add touch feedback
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

// =============================================================================
// Network-Aware Loading
// =============================================================================

/**
 * Implement smart prefetching
 */
function implementSmartPrefetching(network: NetworkCondition, prefetchDelay: number): void {
  // Don't prefetch on slow connections or data saver mode
  if (network.effectiveType === 'slow-2g' || network.effectiveType === '2g' || network.saveData) {
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
          }, prefetchDelay);
        }
      }
    });
  }, {
    rootMargin: '200px 0px',
  });

  // Observe navigation links
  document.querySelectorAll('a[href]').forEach(link => {
    prefetchObserver.observe(link);
  });
}

/**
 * Apply network-aware loading
 */
export async function applyNetworkAwareLoading(network: NetworkCondition): Promise<void> {
  // Get recommended prefetch delay
  let prefetchDelay = 1000;
  if (network.effectiveType === 'slow-2g' || network.effectiveType === '2g') {
    prefetchDelay = 5000;
  } else if (network.effectiveType === '3g') {
    prefetchDelay = 3000;
  }

  (window as any).mobilePrefetchDelay = prefetchDelay;

  // Implement smart prefetching
  implementSmartPrefetching(network, prefetchDelay);
}

// =============================================================================
// Mobile Caching
// =============================================================================

/**
 * Set up IndexedDB caching
 */
function setupIndexedDBCaching(): void {
  const dbName = 'MobilePerformanceCache';
  const dbVersion = 1;

  const request = indexedDB.open(dbName, dbVersion);

  request.onerror = () => {
    console.warn('IndexedDB not available for mobile caching');
  };

  request.onsuccess = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    (window as any).mobileDB = db;
  };

  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
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
 * Set up offline fallbacks
 */
function setupOfflineFallbacks(): void {
  window.addEventListener('offline', () => {
    document.body.classList.add('offline-mode');
    getRumService().trackCustomMetric('offline_mode_activated', 1);
  });

  window.addEventListener('online', () => {
    document.body.classList.remove('offline-mode');
    getRumService().trackCustomMetric('online_mode_restored', 1);
  });

  // Add offline styles
  const style = document.createElement('style');
  style.id = 'offline-mode-styles';
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
 * Apply mobile-specific caching
 */
export async function applyMobileSpecificCaching(): Promise<void> {
  // Set up IndexedDB caching
  if ('indexedDB' in window) {
    setupIndexedDBCaching();
  }

  // Set up offline fallbacks
  setupOfflineFallbacks();
}

// =============================================================================
// Optimization Factory
// =============================================================================

/**
 * Create all mobile optimizations
 */
export function createMobileOptimizations(
  device: DeviceCapability,
  config: { networkAwareLoading: boolean; batteryOptimization: boolean }
): MobileOptimization[] {
  return [
    {
      name: 'adaptive_image_loading',
      condition: (d, n) =>
        d.isMobile && (n.effectiveType === '3g' || n.effectiveType === '2g'),
      apply: async () => applyAdaptiveImageLoading(device, { effectiveType: '3g', downlink: 1.5, rtt: 300, saveData: false }),
      impact: { loadTime: 1200, dataUsage: 40, batteryLife: 15 },
    },
    {
      name: 'reduced_animation',
      condition: (d) => d.isMobile && d.memoryGB < 4,
      apply: applyReducedAnimation,
      impact: { loadTime: 300, dataUsage: 10, batteryLife: 20 },
    },
    {
      name: 'data_saver_mode',
      condition: (_, n) =>
        n.saveData || n.effectiveType === 'slow-2g' || n.effectiveType === '2g',
      apply: async () => applyDataSaverMode(device),
      impact: { loadTime: 800, dataUsage: 60, batteryLife: 25 },
    },
    {
      name: 'battery_optimization',
      condition: (d) => d.isMobile && config.batteryOptimization,
      apply: applyBatteryOptimization,
      impact: { loadTime: 200, dataUsage: 15, batteryLife: 30 },
    },
    {
      name: 'memory_optimization',
      condition: (d) => d.memoryGB < 3,
      apply: async () => applyMemoryOptimization(device),
      impact: { loadTime: 500, dataUsage: 5, batteryLife: 10 },
    },
    {
      name: 'touch_optimization',
      condition: (d) => d.hasTouch,
      apply: applyTouchOptimization,
      impact: { loadTime: 100, dataUsage: 5, batteryLife: 15 },
    },
    {
      name: 'network_aware_loading',
      condition: () => config.networkAwareLoading,
      apply: async () => applyNetworkAwareLoading({ effectiveType: '3g', downlink: 1.5, rtt: 300, saveData: false }),
      impact: { loadTime: 600, dataUsage: 30, batteryLife: 20 },
    },
    {
      name: 'mobile_specific_caching',
      condition: (d) => d.isMobile,
      apply: applyMobileSpecificCaching,
      impact: { loadTime: 400, dataUsage: 20, batteryLife: 10 },
    },
  ];
}
