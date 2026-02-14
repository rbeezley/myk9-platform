import { useState, useEffect, useCallback, useRef } from 'react';
import { monitoring } from '../../services/MonitoringService';
import { logger } from '@/services/LoggingService';

export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement | null>, boolean] => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const targetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        ...options,
      }
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
    };
  }, [options]);

  return [targetRef, isIntersecting];
};

export const useLazyLoading = (shouldLoad: boolean = true) => {
  const [isVisible, setIsVisible] = useState(!shouldLoad);
  const [ref, inView] = useIntersectionObserver();

  useEffect(() => {
    if (shouldLoad && inView && !isVisible) {
      queueMicrotask(() => {
        setIsVisible(true);
      });
      monitoring.trackFeatureUsage('lazy_loading');
    }
  }, [inView, shouldLoad, isVisible]);

  return {
    ref,
    isVisible: isVisible || !shouldLoad,
    inView,
  };
};

export const useImageOptimization = (src: string, options: {
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
  sizes?: string[];
  lazy?: boolean;
} = {}) => {
  const { quality = 85, format = 'auto', sizes = [], lazy = true } = options;
  const [optimizedSrc, setOptimizedSrc] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateOptimizedUrl = useCallback((originalSrc: string) => {
    if (import.meta.env.VITE_CDN_URL) {
      const params = new URLSearchParams();
      params.set('q', quality.toString());
      if (format !== 'auto') params.set('f', format);
      if (sizes.length > 0) params.set('w', sizes[0]);

      return `${import.meta.env.VITE_CDN_URL}/${originalSrc}?${params.toString()}`;
    }

    return originalSrc;
  }, [quality, format, sizes]);

  useEffect(() => {
    if (!src) return;

    const optimized = generateOptimizedUrl(src);
    queueMicrotask(() => {
      setOptimizedSrc(optimized);
    });

    if (!lazy) {
      const img = new Image();
      img.onload = () => setIsLoaded(true);
      img.onerror = () => setError('Failed to load image');
      img.src = optimized;
    }
  }, [src, generateOptimizedUrl, lazy]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    monitoring.recordPerformanceMetric('image.load_time', performance.now(), 'ms');
  }, []);

  const handleError = useCallback(() => {
    setError('Failed to load image');
    logger.error('Image load failed', 'performance', { src: optimizedSrc });
  }, [optimizedSrc]);

  return {
    src: optimizedSrc,
    isLoaded,
    error,
    onLoad: handleLoad,
    onError: handleError,
  };
};
