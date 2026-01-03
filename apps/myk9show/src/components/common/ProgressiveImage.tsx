import React, { useState, useCallback, useMemo } from 'react';
import LazyImage from './LazyImage';
import { cn } from '@/lib/utils';

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  blur?: boolean;
  // Removed quality prop as it's not currently used
  loading?: 'lazy' | 'eager';
  onLoad?: () => void;
  onError?: () => void;
  fallbackIcon?: React.ReactNode;
  sizes?: string;
  style?: React.CSSProperties;
}

// Generate low-quality placeholder URL
const generatePlaceholderUrl = (src: string): string => {
  // For demo purposes, we'll use a simple approach
  // In a real app, you might use a service like Cloudinary or similar
  
  // If it's already a processed URL, return it
  if (src.includes('cloudinary') || src.includes('placeholder')) {
    return src;
  }
  
  // Create a simple placeholder - in production, this would generate actual low-res versions
  return src; // Fallback to original for now
};

// Generate different quality versions of images
const generateSrcSet = (): string => {
  // In production, this would generate actual responsive image URLs
  // For now, return empty string to use single source
  return '';
};

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  className,
  width,
  height,
  blur = true,
  loading = 'lazy',
  onLoad,
  onError,
  fallbackIcon,
  sizes,
  style,
}) => {
  const [imageError, setImageError] = useState(false);

  // Memoize placeholder URL generation
  const placeholderSrc = useMemo(() => {
    if (!src || imageError) return undefined;
    return generatePlaceholderUrl(src);
  }, [src, imageError]);

  // Memoize srcSet generation
  const srcSet = useMemo(() => {
    if (!src || imageError) return undefined;
    return generateSrcSet();
  }, [src, imageError]);

  // Handle image loading error
  const handleError = useCallback(() => {
    setImageError(true);
    onError?.();
  }, [onError]);

  // Handle successful image load
  const handleLoad = useCallback(() => {
    setImageError(false);
    onLoad?.();
  }, [onLoad]);

  // If image failed and we have a fallback icon, show it
  if (imageError && fallbackIcon) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className
        )}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          ...style,
        }}
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <LazyImage
      src={src}
      alt={alt}
      className={className}
      placeholderSrc={blur ? placeholderSrc : undefined}
      loading={loading}
      onLoad={handleLoad}
      onError={handleError}
      width={width}
      height={height}
      sizes={sizes}
      srcSet={srcSet}
      style={style}
      threshold={0.1}
      rootMargin="100px"
    />
  );
};

export default React.memo(ProgressiveImage);

// Export a specialized component for avatars
export const ProgressiveAvatar: React.FC<{
  src?: string;
  alt: string;
  size?: number;
  className?: string;
  fallbackIcon?: React.ReactNode;
  loading?: 'lazy' | 'eager';
}> = React.memo(({ 
  src, 
  alt, 
  size = 80, 
  className, 
  fallbackIcon,
  loading = 'lazy'
}) => {
  return (
    <ProgressiveImage
      src={src || ''}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-full", className)}
      fallbackIcon={fallbackIcon}
      loading={loading}
      blur={true}
    />
  );
});

ProgressiveAvatar.displayName = 'ProgressiveAvatar';

// Export a specialized component for dog photos
export const ProgressiveDogPhoto: React.FC<{
  src?: string;
  alt: string;
  className?: string;
  width?: number | string;
  height?: number | string;
  fallbackIcon?: React.ReactNode;
  loading?: 'lazy' | 'eager';
}> = React.memo(({ 
  src, 
  alt, 
  className, 
  width = "100%", 
  height = 200,
  fallbackIcon,
  loading = 'lazy'
}) => {
  return (
    <ProgressiveImage
      src={src || ''}
      alt={alt}
      width={width}
      height={height}
      className={cn("rounded-lg", className)}
      fallbackIcon={fallbackIcon}
      loading={loading}
      blur={true}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    />
  );
});

ProgressiveDogPhoto.displayName = 'ProgressiveDogPhoto';