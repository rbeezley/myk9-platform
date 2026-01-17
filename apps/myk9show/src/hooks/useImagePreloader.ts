import { useState, useEffect, useCallback, useRef } from 'react';

interface ImagePreloadResult {
  loaded: boolean;
  error: boolean;
  progress: number;
}

interface PreloadOptions {
  priority?: 'high' | 'low';
  timeout?: number;
  retry?: number;
}

// Simple in-memory cache for preloaded images
const imageCache = new Map<string, Promise<string>>();
const loadedImages = new Set<string>();

/**
 * Preload a single image with caching and error handling
 */
const preloadImage = (src: string, options: PreloadOptions = {}): Promise<string> => {
  const { timeout = 10000, retry = 2 } = options;

  // Return cached promise if exists
  if (imageCache.has(src)) {
    return imageCache.get(src)!;
  }

  // If already loaded, return resolved promise
  if (loadedImages.has(src)) {
    return Promise.resolve(src);
  }

  const loadPromise = new Promise<string>((resolve, reject) => {
    let attempts = 0;

    const attemptLoad = () => {
      const img = new Image();
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
      };

      const handleLoad = () => {
        cleanup();
        loadedImages.add(src);
        resolve(src);
      };

      const handleError = () => {
        cleanup();
        attempts++;
        
        if (attempts <= retry) {
          // Exponential backoff for retries
          setTimeout(attemptLoad, Math.pow(2, attempts) * 1000);
        } else {
          reject(new Error(`Failed to load image after ${retry + 1} attempts: ${src}`));
        }
      };

      const handleTimeout = () => {
        cleanup();
        handleError();
      };

      img.onload = handleLoad;
      img.onerror = handleError;
      
      if (timeout > 0) {
        timeoutId = setTimeout(handleTimeout, timeout);
      }

      img.src = src;
    };

    attemptLoad();
  });

  imageCache.set(src, loadPromise);
  return loadPromise;
};

/**
 * Hook for preloading a single image
 */
export const useImagePreloader = (
  src: string | undefined,
  options: PreloadOptions = {}
): ImagePreloadResult => {
  // Use lazy initialization to handle empty src case in initial state
  const [state, setState] = useState<ImagePreloadResult>(() => ({
    loaded: src ? loadedImages.has(src) : false,
    error: false,
    progress: src && loadedImages.has(src) ? 100 : 0,
  }));

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Empty src is handled by initial state - no effect needed
    if (!src) {
      return;
    }

    // Check if already loaded - defer state update
    if (loadedImages.has(src)) {
      queueMicrotask(() => {
        setState({ loaded: true, error: false, progress: 100 });
      });
      return;
    }

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    // Defer initial loading state update
    queueMicrotask(() => {
      setState({ loaded: false, error: false, progress: 10 });
    });

    preloadImage(src, options)
      .then(() => {
        if (!abortControllerRef.current?.signal.aborted) {
          setState({ loaded: true, error: false, progress: 100 });
        }
      })
      .catch(() => {
        if (!abortControllerRef.current?.signal.aborted) {
          setState({ loaded: false, error: true, progress: 0 });
        }
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [src, options]);

  return state;
};

/**
 * Hook for preloading multiple images
 */
export const useMultipleImagePreloader = (
  sources: (string | undefined)[],
  options: PreloadOptions = {}
): {
  allLoaded: boolean;
  loadedCount: number;
  errorCount: number;
  progress: number;
  results: ImagePreloadResult[];
} => {
  // Use lazy initialization to properly handle empty sources case
  const [results, setResults] = useState<ImagePreloadResult[]>(() => {
    const validSources = sources.filter(Boolean) as string[];
    if (validSources.length === 0) {
      return [];
    }
    return sources.map((src) =>
      src && loadedImages.has(src)
        ? { loaded: true, error: false, progress: 100 }
        : { loaded: false, error: false, progress: 0 }
    );
  });

  const abortControllersRef = useRef<AbortController[]>([]);

  useEffect(() => {
    const validSources = sources.filter(Boolean) as string[];

    // Empty sources case is handled by initial state - no effect needed
    if (validSources.length === 0) {
      return;
    }

    // Create abort controllers for cleanup
    abortControllersRef.current = validSources.map(() => new AbortController());

    // Initialize results - defer state update
    const initialResults = sources.map((src) =>
      src && loadedImages.has(src)
        ? { loaded: true, error: false, progress: 100 }
        : { loaded: false, error: false, progress: 0 }
    );
    queueMicrotask(() => {
      setResults(initialResults);
    });

    // Preload all images
    const preloadPromises = validSources.map((src, index) => {
      if (loadedImages.has(src)) {
        return Promise.resolve(src);
      }

      return preloadImage(src, options)
        .then(() => {
          if (!abortControllersRef.current[index]?.signal.aborted) {
            setResults(prev => prev.map((result, i) => 
              i === index ? { loaded: true, error: false, progress: 100 } : result
            ));
          }
          return src;
        })
        .catch(() => {
          if (!abortControllersRef.current[index]?.signal.aborted) {
            setResults(prev => prev.map((result, i) => 
              i === index ? { loaded: false, error: true, progress: 0 } : result
            ));
          }
          throw new Error(`Failed to load: ${src}`);
        });
    });

    // Optional: Update progress as images load
    Promise.allSettled(preloadPromises);

    return () => {
      abortControllersRef.current.forEach(controller => controller.abort());
    };
  }, [sources, options]);

  // Calculate aggregate stats
  const stats = results.reduce(
    (acc, result) => ({
      loadedCount: acc.loadedCount + (result.loaded ? 1 : 0),
      errorCount: acc.errorCount + (result.error ? 1 : 0),
      totalProgress: acc.totalProgress + result.progress,
    }),
    { loadedCount: 0, errorCount: 0, totalProgress: 0 }
  );

  return {
    allLoaded: stats.loadedCount === sources.length,
    loadedCount: stats.loadedCount,
    errorCount: stats.errorCount,
    progress: sources.length > 0 ? stats.totalProgress / sources.length : 0,
    results,
  };
};

/**
 * Hook for prefetching images that will likely be needed soon
 */
export const useImagePrefetcher = () => {
  const prefetchedRef = useRef(new Set<string>());

  const prefetch = useCallback((sources: string[], options: PreloadOptions = { priority: 'low' }) => {
    const newSources = sources.filter(src => !prefetchedRef.current.has(src));
    
    newSources.forEach(src => {
      prefetchedRef.current.add(src);
      preloadImage(src, options).catch(() => {
        // Silent fail for prefetch - remove from cache so it can be retried
        prefetchedRef.current.delete(src);
      });
    });
  }, []);

  const isPrefetched = useCallback((src: string) => {
    return loadedImages.has(src) || prefetchedRef.current.has(src);
  }, []);

  return { prefetch, isPrefetched };
};

/**
 * Clear the image cache (useful for testing or memory management)
 */
export const clearImageCache = () => {
  imageCache.clear();
  loadedImages.clear();
};

export default useImagePreloader;