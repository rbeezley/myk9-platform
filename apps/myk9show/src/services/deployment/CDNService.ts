import { logger } from '@/services/LoggingService';

// CDN Service for static asset delivery optimization

/**
 * CDN Service for static asset delivery optimization
 * Handles asset distribution, caching, and performance optimization
 */
export class CDNService {
  private static instance: CDNService;
  private config: CDNConfig;
  private assetCache: Map<string, CachedAsset> = new Map();
  private compressionWorker?: Worker;

  private constructor() {
    this.config = this.getDefaultConfig();
    this.initializeCompressionWorker();
  }

  static getInstance(): CDNService {
    if (!CDNService.instance) {
      CDNService.instance = new CDNService();
    }
    return CDNService.instance;
  }

  /**
   * Configure CDN settings
   */
  configure(config: Partial<CDNConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get optimized asset URL with CDN acceleration
   */
  getAssetUrl(assetPath: string, options: AssetOptions = {}): string {
    const { 
      fallback = true
    } = options;

    // Check if asset is cached
    const cacheKey = this.generateCacheKey(assetPath, options);
    const cached = this.assetCache.get(cacheKey);
    
    if (cached && !this.isCacheExpired(cached)) {
      return cached.url;
    }

    // Build CDN URL with optimizations
    const baseUrl = this.config.baseUrl;
    const transformations = this.buildTransformations(options);
    const versionedPath = this.addVersioning(assetPath);
    
    let cdnUrl = `${baseUrl}/${transformations}/${versionedPath}`;
    
    // Add fallback URL if enabled
    if (fallback) {
      cdnUrl += `?fallback=${encodeURIComponent(this.getFallbackUrl(assetPath))}`;
    }

    // Cache the result
    this.assetCache.set(cacheKey, {
      url: cdnUrl,
      timestamp: Date.now(),
      assetPath,
      options
    });

    return cdnUrl;
  }

  /**
   * Upload asset to CDN with optimization
   */
  async uploadAsset(
    file: File | Blob,
    path: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const startTime = performance.now();
    
    try {
      // Compress asset if needed
      const optimizedFile = await this.optimizeAsset(file, options);
      
      // Generate upload URL
      const uploadUrl = await this.getUploadUrl(path, options);
      
      // Upload to CDN
      const uploadResponse = await this.performUpload(uploadUrl, optimizedFile, options);
      
      // Invalidate cache for this path
      this.invalidateCache(path);
      
      const duration = performance.now() - startTime;
      
      return {
        success: true,
        assetUrl: this.getAssetUrl(path),
        originalSize: file.size,
        optimizedSize: optimizedFile.size,
        compressionRatio: (file.size - optimizedFile.size) / file.size,
        uploadTime: duration,
        etag: uploadResponse.etag,
        version: uploadResponse.version
      };
    } catch (error) {
      throw new Error(`CDN upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Batch upload multiple assets
   */
  async uploadAssets(
    assets: Array<{ file: File | Blob; path: string; options?: UploadOptions }>
  ): Promise<BatchUploadResult> {
    const startTime = performance.now();
    const results: UploadResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    
    const uploadPromises = assets.map(async ({ file, path, options = {} }) => {
      try {
        const result = await this.uploadAsset(file, path, options);
        results.push(result);
      } catch (error) {
        errors.push({ path, error: error instanceof Error ? error.message : String(error) });
      }
    });
    
    await Promise.allSettled(uploadPromises);
    
    const totalDuration = performance.now() - startTime;
    const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalOptimizedSize = results.reduce((sum, r) => sum + r.optimizedSize, 0);
    
    return {
      successful: results.length,
      failed: errors.length,
      totalCompressionRatio: (totalOriginalSize - totalOptimizedSize) / totalOriginalSize,
      totalDuration,
      results,
      errors
    };
  }

  /**
   * Invalidate CDN cache for specific assets
   */
  async invalidateCache(paths: string | string[]): Promise<InvalidationResult> {
    const pathArray = Array.isArray(paths) ? paths : [paths];
    
    try {
      const response = await fetch(`${this.config.apiUrl}/invalidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({ paths: pathArray })
      });
      
      if (!response.ok) {
        throw new Error(`Invalidation failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Clear local cache
      pathArray.forEach(path => {
        for (const [key, cached] of this.assetCache.entries()) {
          if (cached.assetPath.includes(path)) {
            this.assetCache.delete(key);
          }
        }
      });
      
      return {
        success: true,
        invalidationId: result.id,
        estimatedTime: result.estimatedTime,
        paths: pathArray
      };
    } catch (error) {
      throw new Error(`Cache invalidation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get CDN performance analytics
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getAnalytics(timeRange: AnalyticsTimeRange): Promise<CDNAnalytics> {
    try {
      const response = await fetch(`${this.config.apiUrl}/analytics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Analytics fetch failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch CDN analytics:', 'deployment', {}, error as Error);
      return this.getDefaultAnalytics();
    }
  }

  /**
   * Preload critical assets
   */
  async preloadAssets(assetPaths: string[]): Promise<PreloadResult> {
    const startTime = performance.now();
    const results: Array<{ path: string; success: boolean; loadTime: number }> = [];
    
    const preloadPromises = assetPaths.map(async (path) => {
      const assetStartTime = performance.now();
      try {
        const url = this.getAssetUrl(path);
        await this.preloadAsset(url);
        const loadTime = performance.now() - assetStartTime;
        results.push({ path, success: true, loadTime });
      } catch {
        // Error handling
        const loadTime = performance.now() - assetStartTime;
        results.push({ path, success: false, loadTime });
      }
    });
    
    await Promise.allSettled(preloadPromises);
    
    const totalDuration = performance.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    return {
      totalAssets: assetPaths.length,
      successfulPreloads: successCount,
      averageLoadTime: results.reduce((sum, r) => sum + r.loadTime, 0) / results.length,
      totalDuration,
      results
    };
  }

  /**
   * Configure caching rules
   */
  setCachingRules(rules: CachingRule[]): void {
    this.config.cachingRules = rules;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    let hitCount = 0;
    let expiredCount = 0;
    
    for (const cached of this.assetCache.values()) {
      if (this.isCacheExpired(cached)) {
        expiredCount++;
      } else {
        hitCount++;
      }
    }
    
    return {
      totalEntries: this.assetCache.size,
      hitCount,
      expiredCount,
      hitRate: this.assetCache.size > 0 ? hitCount / this.assetCache.size : 0,
      memoryUsage: this.estimateCacheMemoryUsage()
    };
  }

  // Private methods
  
  private getDefaultConfig(): CDNConfig {
    return {
      baseUrl: process.env.VITE_CDN_BASE_URL || 'https://cdn.myk9show.com',
      apiUrl: process.env.VITE_CDN_API_URL || 'https://api.cdn.myk9show.com',
      apiKey: process.env.VITE_CDN_API_KEY || '',
      defaultQuality: 80,
      enableWebP: true,
      enableAVIF: true,
      cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      compressionLevel: 'balanced',
      cachingRules: [
        { pattern: '*.jpg', maxAge: 86400, quality: 80 },
        { pattern: '*.png', maxAge: 86400, quality: 85 },
        { pattern: '*.webp', maxAge: 86400, quality: 75 },
        { pattern: '*.svg', maxAge: 604800, compression: 'gzip' },
        { pattern: '*.css', maxAge: 604800, compression: 'gzip' },
        { pattern: '*.js', maxAge: 604800, compression: 'gzip' }
      ]
    };
  }

  private initializeCompressionWorker(): void {
    if (typeof Worker !== 'undefined') {
      try {
        this.compressionWorker = new Worker(
          new URL('../workers/compressionWorker.js', import.meta.url)
        );
      } catch (error) {
        logger.warn('Failed to initialize compression worker:', 'deployment', {}, error as Error);
      }
    }
  }

  private generateCacheKey(assetPath: string, options: AssetOptions): string {
    const optionsStr = JSON.stringify(options);
    return `${assetPath}:${btoa(optionsStr)}`;
  }

  private isCacheExpired(cached: CachedAsset): boolean {
    return Date.now() - cached.timestamp > this.config.cacheTTL;
  }

  private buildTransformations(options: AssetOptions): string {
    const transforms: string[] = [];
    
    if (options.width || options.height) {
      const w = options.width || 'auto';
      const h = options.height || 'auto';
      transforms.push(`w_${w},h_${h}`);
    }
    
    if (options.quality && options.quality !== 'auto') {
      transforms.push(`q_${options.quality}`);
    }
    
    if (options.format && options.format !== 'auto') {
      transforms.push(`f_${options.format}`);
    }
    
    return transforms.length > 0 ? transforms.join(',') : 'auto';
  }

  private addVersioning(assetPath: string): string {
    // Add version parameter for cache busting
    const version = process.env.VITE_APP_VERSION || 'latest';
    return `${assetPath}?v=${version}`;
  }

  private getFallbackUrl(assetPath: string): string {
    return `${window.location.origin}/${assetPath}`;
  }

  private async optimizeAsset(
    file: File | Blob,
    options: UploadOptions
  ): Promise<Blob> {
    if (this.compressionWorker && options.compress !== false) {
      return new Promise((resolve) => {
        this.compressionWorker!.postMessage({
          file,
          quality: options.quality || this.config.defaultQuality,
          format: options.format
        });
        
        this.compressionWorker!.onmessage = (event) => {
          resolve(event.data.compressedFile);
        };
        
        this.compressionWorker!.onerror = (error) => {
          logger.warn('Compression worker failed, using original file:', 'deployment', {}, error as Error);
          resolve(file);
        };
      });
    }
    
    return file;
  }

  private async getUploadUrl(path: string, options: UploadOptions): Promise<string> {
    const response = await fetch(`${this.config.apiUrl}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        path,
        contentType: options.contentType,
        public: options.public !== false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result.uploadUrl;
  }

  private async performUpload(
    uploadUrl: string,
    file: Blob,
    options: UploadOptions
  ): Promise<{ etag: string; version: string }> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': options.contentType || 'application/octet-stream'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    
    return {
      etag: response.headers.get('etag') || '',
      version: response.headers.get('x-version') || '1'
    };
  }

  private async preloadAsset(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to preload ${url}`));
      document.head.appendChild(link);
    });
  }

  private estimateCacheMemoryUsage(): number {
    // Rough estimation of cache memory usage
    let bytes = 0;
    for (const [key, cached] of this.assetCache.entries()) {
      bytes += key.length * 2; // UTF-16 encoding
      bytes += cached.url.length * 2;
      bytes += cached.assetPath.length * 2;
      bytes += 64; // Object overhead
    }
    return bytes;
  }

  private getDefaultAnalytics(): CDNAnalytics {
    return {
      requests: 0,
      bandwidth: 0,
      hitRate: 0,
      averageResponseTime: 0,
      errorRate: 0,
      topAssets: [],
      geographicDistribution: {},
      timeSeriesData: []
    };
  }
}

// Types

interface CDNConfig {
  baseUrl: string;
  apiUrl: string;
  apiKey: string;
  defaultQuality: number;
  enableWebP: boolean;
  enableAVIF: boolean;
  cacheTTL: number;
  compressionLevel: 'fast' | 'balanced' | 'best';
  cachingRules: CachingRule[];
}

interface AssetOptions {
  quality?: number | 'auto';
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
  width?: number;
  height?: number;
  fallback?: boolean;
}

interface UploadOptions {
  quality?: number;
  format?: string;
  compress?: boolean;
  contentType?: string;
  public?: boolean;
}

interface CachedAsset {
  url: string;
  timestamp: number;
  assetPath: string;
  options: AssetOptions;
}

interface UploadResult {
  success: boolean;
  assetUrl: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  uploadTime: number;
  etag: string;
  version: string;
}

interface BatchUploadResult {
  successful: number;
  failed: number;
  totalCompressionRatio: number;
  totalDuration: number;
  results: UploadResult[];
  errors: Array<{ path: string; error: string }>;
}

interface InvalidationResult {
  success: boolean;
  invalidationId: string;
  estimatedTime: number;
  paths: string[];
}

interface PreloadResult {
  totalAssets: number;
  successfulPreloads: number;
  averageLoadTime: number;
  totalDuration: number;
  results: Array<{ path: string; success: boolean; loadTime: number }>;
}

interface CachingRule {
  pattern: string;
  maxAge: number;
  quality?: number;
  compression?: 'gzip' | 'brotli';
}

interface CacheStats {
  totalEntries: number;
  hitCount: number;
  expiredCount: number;
  hitRate: number;
  memoryUsage: number;
}

interface CDNAnalytics {
  requests: number;
  bandwidth: number;
  hitRate: number;
  averageResponseTime: number;
  errorRate: number;
  topAssets: Array<{ path: string; requests: number; bandwidth: number }>;
  geographicDistribution: Record<string, number>;
  timeSeriesData: Array<{ timestamp: number; requests: number; bandwidth: number }>;
}

type AnalyticsTimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export type {
  CDNConfig,
  AssetOptions,
  UploadOptions,
  UploadResult,
  BatchUploadResult,
  InvalidationResult,
  PreloadResult,
  CachingRule,
  CacheStats,
  CDNAnalytics,
  AnalyticsTimeRange
};