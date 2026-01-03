/**
 * Image Optimization Service
 *
 * Provides dynamic image quality, format selection, lazy loading,
 * and responsive image generation based on device capabilities.
 */

import { useState, useEffect } from 'react';
import { getDeviceTier } from '@/utils/deviceDetection';
import { logger } from '@/utils/logger';

export type ImageQuality = 'low' | 'medium' | 'high' | 'original';
export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'avif';

export interface ImageOptimizationOptions {
  /** Source image URL */
  src: string;

  /** Alt text for accessibility */
  alt: string;

  /** Desired width (for srcset generation) */
  width?: number;

  /** Desired height */
  height?: number;

  /** Quality override (uses settings if not specified) */
  quality?: ImageQuality;

  /** Enable lazy loading */
  lazy?: boolean;

  /** Blur-up placeholder */
  placeholder?: boolean;

  /** Critical image (load immediately) */
  critical?: boolean;

  /** Sizes attribute for responsive images */
  sizes?: string;
}

export interface OptimizedImageData {
  /** Primary image source */
  src: string;

  /** Srcset for responsive images */
  srcset?: string;

  /** Sizes attribute */
  sizes?: string;

  /** Alt text */
  alt: string;

  /** Loading strategy */
  loading: 'lazy' | 'eager';

  /** Decoding strategy */
  decoding: 'async' | 'sync' | 'auto';

  /** Placeholder data URL (blur-up) */
  placeholder?: string;

  /** Width */
  width?: number;

  /** Height */
  height?: number;
}

/**
 * Get quality setting from user preferences or device tier
 */
async function getImageQuality(): Promise<ImageQuality> {
  // Auto-detect based on device tier
  const tier = await getDeviceTier();
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'medium';
  return 'high';
}

/**
 * Map quality to numeric value (0-100)
 */
function getQualityValue(quality: ImageQuality): number {
  switch (quality) {
    case 'low':
      return 50;
    case 'medium':
      return 70;
    case 'high':
      return 85;
    case 'original':
      return 100;
    default:
      return 85;
  }
}

/**
 * Check if browser supports a specific image format
 */
function supportsFormat(format: ImageFormat): boolean {
  // Create a canvas and try to export in the format
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;

  try {
    switch (format) {
      case 'webp':
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      case 'avif':
        return canvas.toDataURL('image/avif').indexOf('data:image/avif') === 0;
      case 'jpeg':
      case 'png':
        return true; // Always supported
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get best supported image format
 */
function getBestFormat(): ImageFormat {
  // Check in order of efficiency
  if (supportsFormat('avif')) return 'avif';
  if (supportsFormat('webp')) return 'webp';
  return 'jpeg';
}

/**
 * Generate srcset for responsive images
 */
function generateSrcset(
  baseUrl: string,
  quality: number,
  widths: number[] = [320, 640, 960, 1280, 1920]
): string {
  // If using a CDN that supports query parameters, generate srcset
  // Example format: ?w=320&q=85
  return widths
    .map((width) => {
      const url = `${baseUrl}?w=${width}&q=${quality}`;
      return `${url} ${width}w`;
    })
    .join(', ');
}

/**
 * Generate blur-up placeholder (tiny base64 image)
 */
function generatePlaceholder(_src: string): string {
  // In production, this would generate a tiny blurred version
  // For now, return a simple grey placeholder
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzZjRmNiIvPjwvc3ZnPg==';
}

/**
 * Optimize image with CDN parameters
 */
function optimizeWithCDN(src: string, quality: number, width?: number, format?: ImageFormat): string {
  // Check if URL already has query parameters
  const hasParams = src.includes('?');
  const separator = hasParams ? '&' : '?';

  let optimizedUrl = src;

  // Add quality parameter
  optimizedUrl += `${separator}q=${quality}`;

  // Add width parameter
  if (width) {
    optimizedUrl += `&w=${width}`;
  }

  // Add format parameter
  if (format && format !== 'jpeg') {
    optimizedUrl += `&fm=${format}`;
  }

  // Add auto optimization hint
  optimizedUrl += '&auto=format,compress';

  return optimizedUrl;
}

/**
 * Main optimization function
 */
export async function optimizeImage(
  options: ImageOptimizationOptions
): Promise<OptimizedImageData> {
  const quality = options.quality || (await getImageQuality());
  const qualityValue = getQualityValue(quality);
  const bestFormat = getBestFormat();

  // Generate optimized URLs
  const optimizedSrc = optimizeWithCDN(options.src, qualityValue, options.width, bestFormat);

  // Generate srcset for responsive images
  const srcset = options.width
    ? generateSrcset(options.src, qualityValue)
    : undefined;

  // Default sizes attribute
  const sizes = options.sizes || '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

  // Determine loading strategy
  const loading: 'lazy' | 'eager' = options.critical ? 'eager' : (options.lazy !== false ? 'lazy' : 'eager');

  // Generate placeholder if requested
  const placeholder = options.placeholder ? generatePlaceholder(options.src) : undefined;

  return {
    src: optimizedSrc,
    srcset,
    sizes,
    alt: options.alt,
    loading,
    decoding: 'async',
    placeholder,
    width: options.width,
    height: options.height,
  };
}

/**
 * React component helper for optimized images
 * Note: Import React hooks when using this function in a component
 */
export function useOptimizedImage(options: ImageOptimizationOptions) {
  const [imageData, setImageData] = useState<OptimizedImageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadImage() {
      try {
        setIsLoading(true);
        const data = await optimizeImage(options);

        if (mounted) {
          setImageData(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to optimize image'));
          setIsLoading(false);
        }
      }
    }

    loadImage();

    return () => {
      mounted = false;
    };
  }, [options.src, options.quality, options.width]);

  return { imageData, isLoading, error };
}

/**
 * Preload critical images
 */
export function preloadImage(src: string, quality?: ImageQuality): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;

  if (quality) {
    const qualityValue = getQualityValue(quality);
    link.href = optimizeWithCDN(src, qualityValue);
  }

  document.head.appendChild(link);
}

/**
 * Lazy load images using IntersectionObserver
 */
export class LazyImageLoader {
  private observer: IntersectionObserver | null = null;
  private images: Map<Element, string> = new Map();

  constructor(
    private options: IntersectionObserverInit = {
      rootMargin: '50px 0px',
      threshold: 0.01,
    }
  ) {
    this.setupObserver();
  }

  private setupObserver(): void {
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all images immediately
      logger.warn('IntersectionObserver not supported, loading all images immediately');
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.loadImage(entry.target);
        }
      });
    }, this.options);
  }

  private async loadImage(element: Element): Promise<void> {
    const img = element as HTMLImageElement;
    const src = this.images.get(element);

    if (!src) return;

    // Optimize image before loading
    const optimized = await optimizeImage({
      src,
      alt: img.alt || '',
      width: img.width || undefined,
      lazy: false,
    });

    // Update src and srcset
    img.src = optimized.src;
    if (optimized.srcset) {
      img.srcset = optimized.srcset;
    }
    if (optimized.sizes) {
      img.sizes = optimized.sizes;
    }

    // Remove data attribute
    img.removeAttribute('data-src');

    // Stop observing this image
    if (this.observer) {
      this.observer.unobserve(element);
    }

    // Remove from map
    this.images.delete(element);

    // Mark as loaded
    img.classList.add('loaded');
  }

  /**
   * Register an image for lazy loading
   */
  observe(element: HTMLImageElement, src: string): void {
    // Store original src
    this.images.set(element, src);

    // Set placeholder if exists
    const placeholder = element.getAttribute('data-placeholder');
    if (placeholder) {
      element.src = placeholder;
    }

    // Add data attribute
    element.setAttribute('data-src', src);

    // Start observing
    if (this.observer) {
      this.observer.observe(element);
    } else {
      // Fallback: load immediately
      this.loadImage(element);
    }
  }

  /**
   * Stop observing and cleanup
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.images.clear();
  }
}

/**
 * Calculate optimal image dimensions for container
 */
export function calculateOptimalSize(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  mode: 'cover' | 'contain' = 'cover'
): { width: number; height: number } {
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;

  if (mode === 'cover') {
    if (imageAspect > containerAspect) {
      // Image is wider than container
      return {
        width: containerWidth,
        height: Math.round(containerWidth / imageAspect),
      };
    } else {
      // Image is taller than container
      return {
        width: Math.round(containerHeight * imageAspect),
        height: containerHeight,
      };
    }
  } else {
    // contain mode
    if (imageAspect > containerAspect) {
      return {
        width: containerWidth,
        height: Math.round(containerWidth / imageAspect),
      };
    } else {
      return {
        width: Math.round(containerHeight * imageAspect),
        height: containerHeight,
      };
    }
  }
}

/**
 * Estimate data usage for images
 */
export function estimateImageSize(
  width: number,
  height: number,
  quality: ImageQuality,
  format: ImageFormat = 'jpeg'
): number {
  const pixels = width * height;

  // Rough estimates in bytes per pixel
  const bitsPerPixel: Record<ImageFormat, Record<ImageQuality, number>> = {
    jpeg: {
      low: 0.5,
      medium: 1,
      high: 2,
      original: 3,
    },
    webp: {
      low: 0.3,
      medium: 0.7,
      high: 1.5,
      original: 2.5,
    },
    avif: {
      low: 0.2,
      medium: 0.5,
      high: 1,
      original: 2,
    },
    png: {
      low: 2,
      medium: 3,
      high: 4,
      original: 5,
    },
  };

  return Math.round(pixels * bitsPerPixel[format][quality]);
}

/**
 * Global lazy loader instance
 */
export const globalLazyLoader = new LazyImageLoader();
