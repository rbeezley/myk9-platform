import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePageTransition, useProgrammaticTransition, useTransitionPrefetch } from '@/hooks/animations/usePageTransition';

// Mock react-router-dom
const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
  state: null,
  key: 'default'
};

const { mockUseLocation } = vi.hoisted(() => {
  return { mockUseLocation: vi.fn() };
});

vi.mock('react-router-dom', () => ({
  useLocation: mockUseLocation
}));

describe('usePageTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset useLocation to return default location before each test
    mockUseLocation.mockReturnValue(mockLocation);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Default configuration', () => {
    it('should initialize with default config and no transition', () => {
      const { result } = renderHook(() => usePageTransition());
      
      expect(result.current.isTransitioning).toBe(false);
      expect(result.current.isVisible).toBe(true);
      expect(result.current.config).toEqual({
        duration: 300,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        type: 'fade',
      });
    });

    it('should merge custom config with defaults', () => {
      const customConfig = {
        duration: 500,
        type: 'slide' as const,
        direction: 'left' as const,
      };
      
      const { result } = renderHook(() => usePageTransition(customConfig));
      
      expect(result.current.config).toEqual({
        duration: 500,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        type: 'slide',
        direction: 'left',
      });
    });
  });

  describe('Location change handling', () => {
    it('should trigger transition on location change', () => {
      const { result, rerender } = renderHook(() => usePageTransition());

      expect(result.current.isTransitioning).toBe(false);
      expect(result.current.isVisible).toBe(true);

      // Change location
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      expect(result.current.isTransitioning).toBe(true);
      expect(result.current.isVisible).toBe(false);
    });

    it('should complete transition after duration', () => {
      const { result, rerender } = renderHook(() => usePageTransition({ duration: 300 }));

      // Change location
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      expect(result.current.isTransitioning).toBe(true);

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.isTransitioning).toBe(false);
      expect(result.current.isVisible).toBe(true);
    });

    it('should not trigger transition for same pathname', () => {
      const { result, rerender } = renderHook(() => usePageTransition());

      // Change only search params, keep same pathname
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        search: '?tab=settings'
      });

      rerender();

      expect(result.current.isTransitioning).toBe(false);
      expect(result.current.isVisible).toBe(true);
    });
  });

  describe('Transition styles', () => {
    it('should return base styles when not transitioning', () => {
      const { result } = renderHook(() => usePageTransition({ duration: 400 }));
      
      const styles = result.current.getTransitionStyles();
      
      expect(styles).toEqual({
        transition: 'all 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      });
    });

    it('should return fade transition styles', () => {
      const { result, rerender } = renderHook(() => usePageTransition({ type: 'fade' }));

      // Trigger transition
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      const styles = result.current.getTransitionStyles();

      expect(styles).toMatchObject({
        transition: expect.any(String),
        opacity: 0,
      });
    });

    it('should return slide transition styles for all directions', () => {
      const directions: Array<'left' | 'right' | 'up' | 'down'> = ['left', 'right', 'up', 'down'];

      for (const direction of directions) {
        // Reset mock to default before each iteration
        mockUseLocation.mockReturnValue(mockLocation);

        const { result, rerender } = renderHook(() =>
          usePageTransition({ type: 'slide', direction })
        );

        // Trigger transition
        mockUseLocation.mockReturnValue({
          ...mockLocation,
          pathname: `/test-${direction}`
        });

        rerender();

        const styles = result.current.getTransitionStyles();

        expect(styles).toMatchObject({
          transition: expect.any(String),
          transform: expect.stringMatching(/translate/),
        });

        // Check specific transforms
        if (direction === 'left') {
          expect(styles.transform).toBe('translateX(-100%)');
        } else if (direction === 'right') {
          expect(styles.transform).toBe('translateX(100%)');
        } else if (direction === 'up') {
          expect(styles.transform).toBe('translateY(-100%)');
        } else if (direction === 'down') {
          expect(styles.transform).toBe('translateY(100%)');
        }
      }
    });

    it('should return scale transition styles', () => {
      const { result, rerender } = renderHook(() => usePageTransition({ type: 'scale' }));

      // Trigger transition
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      const styles = result.current.getTransitionStyles();

      expect(styles).toMatchObject({
        transition: expect.any(String),
        transform: 'scale(0.95)',
        opacity: 0,
      });
    });

    it('should return flip transition styles', () => {
      const { result, rerender } = renderHook(() => usePageTransition({ type: 'flip' }));

      // Trigger transition
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      const styles = result.current.getTransitionStyles();

      expect(styles).toMatchObject({
        transition: expect.any(String),
        transform: 'rotateY(90deg)',
        transformStyle: 'preserve-3d',
      });
    });

    it('should default to right direction for slide transitions', () => {
      const { result, rerender } = renderHook(() => usePageTransition({ type: 'slide' }));

      // Trigger transition
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      const styles = result.current.getTransitionStyles();

      expect(styles.transform).toBe('translateX(100%)');
    });
  });

  describe('Page container styles', () => {
    it('should return container styles with positioning and overflow', () => {
      const { result } = renderHook(() => usePageTransition());
      
      const containerStyles = result.current.getPageContainerStyles();
      
      expect(containerStyles).toMatchObject({
        position: 'relative',
        overflow: 'hidden',
        transition: expect.any(String),
      });
    });
  });

  describe('Memory cleanup', () => {
    it('should cleanup timer on unmount', () => {
      const { result, rerender, unmount } = renderHook(() => usePageTransition());

      // Change location to trigger transition
      mockUseLocation.mockReturnValue({
        ...mockLocation,
        pathname: '/about'
      });

      rerender();

      expect(result.current.isTransitioning).toBe(true);

      // Unmount before timer completes
      unmount();

      // Timer should be cleaned up (no error should occur)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    });
  });

  describe('Function stability', () => {
    it('should maintain function references between renders', () => {
      const { result, rerender } = renderHook(() => usePageTransition());
      
      const initialFunctions = {
        getTransitionStyles: result.current.getTransitionStyles,
        getPageContainerStyles: result.current.getPageContainerStyles,
      };
      
      rerender();
      
      expect(result.current.getTransitionStyles).toBe(initialFunctions.getTransitionStyles);
      expect(result.current.getPageContainerStyles).toBe(initialFunctions.getPageContainerStyles);
    });
  });
});

describe('useProgrammaticTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with no animation', () => {
    const { result } = renderHook(() => useProgrammaticTransition());
    
    expect(result.current.isAnimating).toBe(false);
  });

  it('should trigger animation and resolve after duration', async () => {
    const { result } = renderHook(() => useProgrammaticTransition());

    let animationPromise: Promise<void>;
    act(() => {
      animationPromise = result.current.animateTransition({ duration: 500, type: 'fade', easing: 'ease' });
    });

    expect(result.current.isAnimating).toBe(true);

    // Fast-forward time
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await animationPromise!;

    expect(result.current.isAnimating).toBe(false);
  });

  it('should use default config when no config provided', async () => {
    const { result } = renderHook(() => useProgrammaticTransition());

    let animationPromise: Promise<void>;
    act(() => {
      animationPromise = result.current.animateTransition();
    });

    expect(result.current.isAnimating).toBe(true);

    // Fast-forward with default duration (300ms)
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await animationPromise!;

    expect(result.current.isAnimating).toBe(false);
  });

  it('should handle multiple concurrent animations', async () => {
    const { result } = renderHook(() => useProgrammaticTransition());

    let animation1: Promise<void>;
    let animation2: Promise<void>;

    act(() => {
      animation1 = result.current.animateTransition({ duration: 200, type: 'fade', easing: 'ease' });
      animation2 = result.current.animateTransition({ duration: 400, type: 'slide', easing: 'ease' });
    });

    expect(result.current.isAnimating).toBe(true);

    // Complete first animation
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await animation1!;

    // Should still be animating due to second animation
    expect(result.current.isAnimating).toBe(true);

    // Complete second animation
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await animation2!;

    expect(result.current.isAnimating).toBe(false);
  });
});

describe('useTransitionPrefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.log to test prefetch logging
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with empty prefetched routes', () => {
    const { result } = renderHook(() => useTransitionPrefetch());
    
    expect(result.current.prefetchedRoutes).toEqual([]);
    expect(result.current.isPrefetched('/any-route')).toBe(false);
  });

  it('should prefetch route and mark as prefetched', () => {
    const { result } = renderHook(() => useTransitionPrefetch());
    
    act(() => {
      result.current.prefetchRoute('/dashboard');
    });
    
    expect(result.current.isPrefetched('/dashboard')).toBe(true);
    expect(result.current.prefetchedRoutes).toEqual(['/dashboard']);
    expect(console.log).toHaveBeenCalledWith('Prefetching route: /dashboard');
  });

  it('should not prefetch same route twice', () => {
    const { result } = renderHook(() => useTransitionPrefetch());
    
    act(() => {
      result.current.prefetchRoute('/dashboard');
      result.current.prefetchRoute('/dashboard');
    });
    
    expect(result.current.prefetchedRoutes).toEqual(['/dashboard']);
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple different routes', () => {
    const { result } = renderHook(() => useTransitionPrefetch());
    
    act(() => {
      result.current.prefetchRoute('/dashboard');
      result.current.prefetchRoute('/profile');
      result.current.prefetchRoute('/settings');
    });
    
    expect(result.current.isPrefetched('/dashboard')).toBe(true);
    expect(result.current.isPrefetched('/profile')).toBe(true);
    expect(result.current.isPrefetched('/settings')).toBe(true);
    expect(result.current.isPrefetched('/unknown')).toBe(false);
    
    expect(result.current.prefetchedRoutes).toEqual([
      '/dashboard',
      '/profile',
      '/settings'
    ]);
  });

  it('should maintain function references between renders', () => {
    const { result, rerender } = renderHook(() => useTransitionPrefetch());
    
    const initialFunctions = {
      prefetchRoute: result.current.prefetchRoute,
      isPrefetched: result.current.isPrefetched,
    };
    
    rerender();
    
    expect(result.current.prefetchRoute).toBe(initialFunctions.prefetchRoute);
    expect(result.current.isPrefetched).toBe(initialFunctions.isPrefetched);
  });

  it('should handle prefetching with special characters in routes', () => {
    const { result } = renderHook(() => useTransitionPrefetch());
    
    const specialRoutes = [
      '/dashboard/user-123',
      '/profile?tab=settings',
      '/reports#monthly',
      '/search?q=dog%20shows'
    ];
    
    act(() => {
      specialRoutes.forEach(route => result.current.prefetchRoute(route));
    });
    
    specialRoutes.forEach(route => {
      expect(result.current.isPrefetched(route)).toBe(true);
    });
    
    expect(result.current.prefetchedRoutes).toEqual(specialRoutes);
  });
});