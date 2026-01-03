import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderSrc?: string;
  threshold?: number;
  rootMargin?: string;
  onLoad?: () => void;
  onError?: () => void;
  fallbackSrc?: string;
  loading?: 'lazy' | 'eager';
  width?: number | string;
  height?: number | string;
  sizes?: string;
  srcSet?: string;
  style?: React.CSSProperties;
}

interface LazyImageState {
  loaded: boolean;
  error: boolean;
  inView: boolean;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className,
  placeholderSrc,
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onError,
  fallbackSrc,
  loading = 'lazy',
  width,
  height,
  sizes,
  srcSet,
  style,
}) => {
  const [state, setState] = useState<LazyImageState>({
    loaded: false,
    error: false,
    inView: false,
  });

  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Handle image load success
  const handleLoad = useCallback(() => {
    setState(prev => ({ ...prev, loaded: true, error: false }));
    onLoad?.();
  }, [onLoad]);

  // Handle image load error
  const handleError = useCallback(() => {
    setState(prev => ({ ...prev, error: true }));
    onError?.();
  }, [onError]);

  // Set up Intersection Observer for lazy loading
  useEffect(() => {
    if (loading === 'eager') {
      setState(prev => ({ ...prev, inView: true }));
      return;
    }

    const img = imgRef.current;
    if (!img) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setState(prev => ({ ...prev, inView: true }));
          observerRef.current?.unobserve(img);
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observerRef.current.observe(img);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [threshold, rootMargin, loading]);

  // Determine which source to use
  const imageSrc = state.error && fallbackSrc ? fallbackSrc : src;
  const shouldShowPlaceholder = !state.loaded && placeholderSrc;
  const shouldLoadImage = state.inView || loading === 'eager';

  return (
    <div 
      className={cn("relative overflow-hidden", className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
    >
      {/* Placeholder image */}
      {shouldShowPlaceholder && (
        <img
          src={placeholderSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-sm scale-110 transition-opacity duration-300"
          style={{
            opacity: state.loaded ? 0 : 1,
          }}
        />
      )}

      {/* Loading skeleton */}
      {!shouldShowPlaceholder && !state.loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}

      {/* Main image */}
      <img
        ref={imgRef}
        src={shouldLoadImage ? imageSrc : undefined}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          state.loaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={handleLoad}
        onError={handleError}
        loading={loading}
        width={width}
        height={height}
        sizes={sizes}
        srcSet={srcSet}
        style={{
          display: shouldLoadImage ? 'block' : 'none',
        }}
      />

      {/* Error state */}
      {state.error && !fallbackSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground">
          <div className="text-center">
            <div className="text-sm">Failed to load image</div>
            <div className="text-xs text-muted-foreground mt-1">{alt}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(LazyImage, (prevProps, nextProps) => {
  // Compare all props that affect image rendering
  return (
    prevProps.src === nextProps.src &&
    prevProps.alt === nextProps.alt &&
    prevProps.className === nextProps.className &&
    prevProps.placeholderSrc === nextProps.placeholderSrc &&
    prevProps.fallbackSrc === nextProps.fallbackSrc &&
    prevProps.loading === nextProps.loading &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.sizes === nextProps.sizes &&
    prevProps.srcSet === nextProps.srcSet &&
    prevProps.threshold === nextProps.threshold &&
    prevProps.rootMargin === nextProps.rootMargin
  );
});