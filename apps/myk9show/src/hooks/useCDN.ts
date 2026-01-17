import { useState, useEffect, useCallback } from 'react';
import { CDNService, type AssetOptions, type UploadResult, type CDNAnalytics } from '@/services/deployment/CDNService';
import { logger } from '@/services/LoggingService';

interface UseCDNResult {
  // Asset management
  getAssetUrl: (path: string, options?: AssetOptions) => string;
  uploadAsset: (file: File | Blob, path: string) => Promise<UploadResult>;
  preloadAssets: (paths: string[]) => Promise<void>;
  
  // Cache management
  invalidateCache: (paths: string | string[]) => Promise<void>;
  
  // Analytics
  analytics: CDNAnalytics | null;
  refreshAnalytics: () => Promise<void>;
  
  // Status
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook for CDN operations
 */
export function useCDN(): UseCDNResult {
  const [cdnService] = useState(() => CDNService.getInstance());
  const [analytics, setAnalytics] = useState<CDNAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAssetUrl = useCallback((path: string, options?: AssetOptions) => {
    try {
      return cdnService.getAssetUrl(path, options);
    } catch (err) {
      logger.error('Failed to get asset URL:', 'hooks', {}, err as Error);
      return path; // Fallback to original path
    }
  }, [cdnService]);

  const uploadAsset = useCallback(async (file: File | Blob, path: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await cdnService.uploadAsset(file, path);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cdnService]);

  const preloadAssets = useCallback(async (paths: string[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await cdnService.preloadAssets(paths);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Preload failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cdnService]);

  const invalidateCache = useCallback(async (paths: string | string[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await cdnService.invalidateCache(paths);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Cache invalidation failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [cdnService]);

  const refreshAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await cdnService.getAnalytics('24h');
      setAnalytics(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [cdnService]);

  // Load initial analytics
  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  return {
    getAssetUrl,
    uploadAsset,
    preloadAssets,
    invalidateCache,
    analytics,
    refreshAnalytics,
    isLoading,
    error
  };
}

/**
 * Hook for optimized image loading with CDN
 */
export function useCDNImage(src: string, options?: AssetOptions) {
  const { getAssetUrl } = useCDN();
  // Use a state object with the src to reset loading state when src changes
  const [loadState, setLoadState] = useState<{
    currentSrc: string;
    isLoaded: boolean;
    isError: boolean;
  }>(() => ({
    currentSrc: '',
    isLoaded: false,
    isError: false
  }));

  const optimizedSrc = getAssetUrl(src, options);

  useEffect(() => {
    // Reset state for new src by setting it in the callback
    const img = new Image();
    img.onload = () => setLoadState({ currentSrc: optimizedSrc, isLoaded: true, isError: false });
    img.onerror = () => setLoadState({ currentSrc: optimizedSrc, isLoaded: false, isError: true });
    img.src = optimizedSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [optimizedSrc]);

  // Derive loading state: if src changed but callbacks haven't fired yet, we're loading
  const isCurrentSrc = loadState.currentSrc === optimizedSrc;

  return {
    src: optimizedSrc,
    isLoaded: isCurrentSrc && loadState.isLoaded,
    isError: isCurrentSrc && loadState.isError
  };
}

/**
 * Hook for bulk asset preloading
 */
export function useAssetPreloader(assetPaths: string[]) {
  const { preloadAssets } = useCDN();
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadedCount, setPreloadedCount] = useState(0);

  const startPreload = useCallback(async () => {
    if (assetPaths.length === 0) return;

    setIsPreloading(true);
    setPreloadedCount(0);

    try {
      await preloadAssets(assetPaths);
      setPreloadedCount(assetPaths.length);
    } catch (error) {
      logger.error('Asset preloading failed:', 'hooks', {}, error as Error);
    } finally {
      setIsPreloading(false);
    }
  }, [assetPaths, preloadAssets]);

  useEffect(() => {
    startPreload();
  }, [startPreload]);

  return {
    isPreloading,
    preloadedCount,
    totalAssets: assetPaths.length,
    progress: assetPaths.length > 0 ? (preloadedCount / assetPaths.length) * 100 : 0
  };
}

export default useCDN;