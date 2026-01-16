import { logger } from '@/services/LoggingService';

/**
 * Optimization Implementations
 *
 * Contains specific optimization strategies for images, fonts, resources, and network.
 */

/**
 * Image optimization module
 */
export const ImageOptimization = {
  /**
   * Apply comprehensive image optimizations
   */
  optimize(): void {
    this.addOptimizationStyles();
    this.implementResponsiveImages();
    this.setupLazyLoading();
  },

  addOptimizationStyles(): void {
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
  },

  implementResponsiveImages(): void {
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
  },

  setupLazyLoading(): void {
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

    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  },
};

/**
 * Font optimization module
 */
export const FontOptimization = {
  /**
   * Apply comprehensive font optimizations
   */
  optimize(): void {
    this.addOptimizationStyles();
    this.preloadCriticalFonts();
    this.implementLoadingOptimization();
  },

  addOptimizationStyles(): void {
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
  },

  preloadCriticalFonts(): void {
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
  },

  implementLoadingOptimization(): void {
    if ('fonts' in document) {
      document.fonts.ready.then(() => {
        document.documentElement.classList.add('font-loaded');
        logger.debug('✅ Fonts loaded successfully', 'performance', {});
      });

      // Set a timeout to prevent indefinite waiting
      setTimeout(() => {
        if (!document.documentElement.classList.contains('font-loaded')) {
          document.documentElement.classList.add('font-loaded');
          logger.warn('⚠️ Font loading timeout - proceeding with fallback fonts', 'performance', {});
        }
      }, 3000);
    }
  },
};

/**
 * Resource prioritization module
 */
export const ResourcePrioritization = {
  /**
   * Apply resource prioritization
   */
  optimize(): void {
    this.setPriorityHints();
    this.deferNonCriticalResources();
    this.implementResourceHints();
  },

  setPriorityHints(): void {
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
  },

  deferNonCriticalResources(): void {
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
  },

  implementResourceHints(): void {
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
  },
};

/**
 * Network optimization module
 */
export const NetworkOptimization = {
  /**
   * Apply network optimizations
   */
  optimize(): void {
    this.implementRequestCoalescing();
    this.setupIntelligentPrefetching();
    this.optimizeApiCalls();
  },

  implementRequestCoalescing(): void {
    const requestQueue = new Map<string, Promise<Response>>();

    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const key = `${method}:${url}`;

      if (requestQueue.has(key)) {
        return requestQueue.get(key)!.then(response => response.clone());
      }

      const request = originalFetch(input, init);
      requestQueue.set(key, request);

      request.finally(() => {
        setTimeout(() => {
          requestQueue.delete(key);
        }, 1000);
      });

      return request;
    };
  },

  setupIntelligentPrefetching(): void {
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
            }, 500);
          }
        }
      });
    }, {
      rootMargin: '100px 0px',
      threshold: 0.1,
    });

    document.querySelectorAll('a[href^="/"]').forEach(link => {
      prefetchObserver.observe(link);
    });
  },

  optimizeApiCalls(): void {
    const requestBatch: Array<{ url: string; resolve: (value: unknown) => void; reject: (error: Error) => void }> = [];
    let batchTimeout: NodeJS.Timeout | null = null;

    const processBatch = async () => {
      if (requestBatch.length === 0) return;

      const batch = requestBatch.splice(0);
      batchTimeout = null;

      try {
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

    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/api/')) {
        return new Promise<Response>((resolve, reject) => {
          requestBatch.push({ url, resolve: resolve as (value: unknown) => void, reject });

          if (!batchTimeout) {
            batchTimeout = setTimeout(processBatch, 10);
          }
        });
      }

      return originalFetch(input, init);
    };
  },
};
