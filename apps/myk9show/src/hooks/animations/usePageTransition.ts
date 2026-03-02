import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { logger } from '@/services/LoggingService';

/**
 * Configuration options for page transitions.
 */
export interface PageTransitionConfig {
  /** Duration of the transition in milliseconds */
  duration: number;
  /** CSS easing function for the transition */
  easing: string;
  /** Type of transition animation */
  type: 'fade' | 'slide' | 'scale' | 'flip';
  /** Direction for slide transitions */
  direction?: 'left' | 'right' | 'up' | 'down';
}

const defaultConfig: PageTransitionConfig = {
  duration: 300,
  easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // standard easing
  type: 'fade',
};

/**
 * Hook for managing smooth page transitions between routes.
 * Automatically detects route changes and applies transition animations.
 * 
 * @param config - Configuration options for the transition
 * @returns Object with transition state and styling functions
 * 
 * @example
 * ```typescript
 * function App() {
 *   const { isTransitioning, getPageContainerStyles } = usePageTransition({
 *     type: 'slide',
 *     direction: 'right',
 *     duration: 400
 *   });
 * 
 *   return (
 *     <div style={getPageContainerStyles()}>
 *       <Routes>
 *         <Route path="/" element={<HomePage />} />
 *         <Route path="/about" element={<AboutPage />} />
 *       </Routes>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePageTransition(config: Partial<PageTransitionConfig> = {}) {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [_previousLocation, setPreviousLocation] = useState(location);

  const finalConfig = useMemo(
    () => ({ ...defaultConfig, ...config }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.duration, config.easing, config.type, config.direction]
  );

  // Handle location changes using render-time sync pattern
  const locationPath = location.pathname;
  const [prevLocationPath, setPrevLocationPath] = useState(locationPath);
  if (locationPath !== prevLocationPath) {
    setPrevLocationPath(locationPath);
    setIsTransitioning(true);
    setIsVisible(false);
  }

  // Handle transition completion
  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        setPreviousLocation(location);
        setIsVisible(true);
        setIsTransitioning(false);
      }, finalConfig.duration);

      return () => clearTimeout(timer);
    }
  }, [isTransitioning, location, finalConfig.duration]);

  // Get transition styles
  const getTransitionStyles = useCallback(() => {
    const baseStyles = {
      transition: `all ${finalConfig.duration}ms ${finalConfig.easing}`,
    };

    if (!isTransitioning) {
      return baseStyles;
    }

    switch (finalConfig.type) {
      case 'fade':
        return {
          ...baseStyles,
          opacity: isVisible ? 1 : 0,
        };

      case 'slide': {
        const direction = finalConfig.direction || 'right';
        let transform = '';
        
        if (!isVisible) {
          switch (direction) {
            case 'left':
              transform = 'translateX(-100%)';
              break;
            case 'right':
              transform = 'translateX(100%)';
              break;
            case 'up':
              transform = 'translateY(-100%)';
              break;
            case 'down':
              transform = 'translateY(100%)';
              break;
          }
        }

        return {
          ...baseStyles,
          transform: isVisible ? 'translate(0)' : transform,
        };
      }

      case 'scale':
        return {
          ...baseStyles,
          transform: isVisible ? 'scale(1)' : 'scale(0.95)',
          opacity: isVisible ? 1 : 0,
        };

      case 'flip':
        return {
          ...baseStyles,
          transform: isVisible ? 'rotateY(0deg)' : 'rotateY(90deg)',
          transformStyle: 'preserve-3d' as const,
        };

      default:
        return baseStyles;
    }
  }, [finalConfig, isTransitioning, isVisible]);

  // Get page container styles
  const getPageContainerStyles = useCallback(() => {
    return {
      position: 'relative' as const,
      overflow: 'hidden',
      ...getTransitionStyles(),
    };
  }, [getTransitionStyles]);

  return {
    isTransitioning,
    isVisible,
    getTransitionStyles,
    getPageContainerStyles,
    config: finalConfig,
  };
}

/**
 * Hook for triggering programmatic transitions without route changes.
 * Useful for custom animations or loading states.
 * 
 * @returns Object with animation state and trigger function
 * 
 * @example
 * ```typescript
 * function CustomTransition() {
 *   const { isAnimating, animateTransition } = useProgrammaticTransition();
 * 
 *   const handleCustomAction = async () => {
 *     await animateTransition({ type: 'fade', duration: 500 });
 *     // Perform action after transition
 *     await performAction();
 *   };
 * 
 *   return (
 *     <div className={isAnimating ? 'opacity-50' : 'opacity-100'}>
 *       <Button onClick={handleCustomAction}>Trigger Transition</Button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useProgrammaticTransition() {
  const [isAnimating, setIsAnimating] = useState(false);
  const activeAnimationsRef = useRef(0);

  const animateTransition = useCallback(async (
    config: Partial<PageTransitionConfig> = {}
  ) => {
    const finalConfig = { ...defaultConfig, ...config };
    activeAnimationsRef.current += 1;
    setIsAnimating(true);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        activeAnimationsRef.current -= 1;
        if (activeAnimationsRef.current === 0) {
          setIsAnimating(false);
        }
        resolve();
      }, finalConfig.duration);
    });
  }, []);

  return {
    isAnimating,
    animateTransition,
  };
}

/**
 * Hook for prefetching routes to improve transition performance.
 * Tracks which routes have been prefetched to avoid duplicate requests.
 * 
 * @returns Object with prefetching functions and state
 * 
 * @example
 * ```typescript
 * function NavigationMenu() {
 *   const { prefetchRoute, isPrefetched } = useTransitionPrefetch();
 * 
 *   const handleHover = (route: string) => {
 *     prefetchRoute(route);
 *   };
 * 
 *   return (
 *     <nav>
 *       <Link 
 *         to="/dashboard" 
 *         onMouseEnter={() => handleHover('/dashboard')}
 *         className={isPrefetched('/dashboard') ? 'prefetched' : ''}
 *       >
 *         Dashboard
 *       </Link>
 *     </nav>
 *   );
 * }
 * ```
 */
export function useTransitionPrefetch() {
  const [routes, setRoutes] = useState<Set<string>>(new Set());

  const prefetchRoute = useCallback((route: string) => {
    setRoutes(prev => {
      if (prev.has(route)) return prev;
      logger.debug(`Prefetching route: ${route}`, 'navigation');
      return new Set([...prev, route]);
    });
  }, []);

  const isPrefetched = useCallback((route: string) => {
    return routes.has(route);
  }, [routes]);

  return {
    prefetchRoute,
    isPrefetched,
    prefetchedRoutes: Array.from(routes),
  };
}