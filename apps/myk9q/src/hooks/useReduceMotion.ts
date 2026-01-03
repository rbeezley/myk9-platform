/**
 * Reduce Motion Hook
 *
 * React hook for accessing and responding to reduce motion preferences.
 * Uses system (OS) preference only.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  getAnimationConfig,
  subscribeToReduceMotionChanges,
  type AnimationConfig,
} from '@/utils/reduceMotionUtils';

/** Motion prop values type for animation libraries like Framer Motion */
type MotionPropValue = Record<string, unknown>;

/**
 * Main hook for reduce motion preference (OS setting only)
 */
export function useReduceMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return prefersReduced;
}

/**
 * Hook for animation duration with reduce motion support
 */
export function useAnimationDuration(baseDuration: number): number {
  const reduced = useReduceMotion();
  return reduced ? 0 : baseDuration;
}

/**
 * Hook for animation configuration
 */
export function useAnimationConfig(
  baseDuration = 300,
  baseEasing = 'ease-out',
  baseDelay = 0
): AnimationConfig {
  const reduced = useReduceMotion();

  return useMemo(
    () => ({
      enabled: !reduced,
      duration: reduced ? 0 : baseDuration,
      easing: reduced ? 'linear' : baseEasing,
      delay: reduced ? 0 : baseDelay,
    }),
    [reduced, baseDuration, baseEasing, baseDelay]
  );
}

/**
 * Hook for scroll behavior
 */
export function useScrollBehavior(): 'auto' | 'smooth' {
  const reduced = useReduceMotion();
  return reduced ? 'auto' : 'smooth';
}

/**
 * Hook for transition styles
 */
export function useTransitionStyles(baseMs = 300): React.CSSProperties {
  const duration = useAnimationDuration(baseMs);

  return useMemo(
    () => ({
      transitionDuration: `${duration}ms`,
      transitionTimingFunction: duration === 0 ? 'linear' : 'ease-out',
    }),
    [duration]
  );
}

/**
 * Hook for Framer Motion animation props
 */
export function useMotionProps(config?: {
  initial?: MotionPropValue;
  animate?: MotionPropValue;
  exit?: MotionPropValue;
  transition?: MotionPropValue;
}) {
  const reduced = useReduceMotion();

  return useMemo(() => {
    if (reduced) {
      return {
        initial: false,
        animate: config?.animate || {},
        exit: false,
        transition: { duration: 0 },
      };
    }

    return {
      initial: config?.initial || {},
      animate: config?.animate || {},
      exit: config?.exit || {},
      transition: config?.transition || { duration: 0.3 },
    };
  }, [reduced, config]);
}

/**
 * Hook to conditionally render animated vs static content
 */
export function useAnimatedContent<T>(animatedContent: T, staticContent: T): T {
  const reduced = useReduceMotion();
  return reduced ? staticContent : animatedContent;
}

/**
 * Hook for CSS animation classes
 */
export function useAnimationClasses(baseClasses: string): string {
  const reduced = useReduceMotion();

  return useMemo(() => {
    if (reduced) {
      return `${baseClasses} no-animation reduce-motion`;
    }
    return baseClasses;
  }, [baseClasses, reduced]);
}

/**
 * Hook for monitoring reduce motion changes
 */
export function useReduceMotionListener(callback: (reduced: boolean) => void): void {
  useEffect(() => {
    const unsubscribe = subscribeToReduceMotionChanges(callback);
    return unsubscribe;
  }, [callback]);
}

/**
 * Hook for prefersReducedMotion media query only
 */
export function usePrefersReducedMotion(): boolean {
  return useReduceMotion();
}

/**
 * Hook for spring animation config
 */
export function useSpringConfig(preset: 'gentle' | 'wobbly' | 'stiff' | 'slow' = 'gentle') {
  const reduced = useReduceMotion();

  return useMemo(() => {
    if (reduced) {
      return { tension: 500, friction: 50, duration: 0 };
    }

    const presets = {
      gentle: { tension: 120, friction: 14 },
      wobbly: { tension: 180, friction: 12 },
      stiff: { tension: 210, friction: 20 },
      slow: { tension: 280, friction: 60 },
    };

    return presets[preset];
  }, [reduced, preset]);
}

/**
 * Hook for safe requestAnimationFrame
 */
export function useSafeRAF(callback: FrameRequestCallback, deps: React.DependencyList = []) {
  const reduced = useReduceMotion();

  useEffect(() => {
    if (reduced) {
      // Execute immediately for reduced motion
      callback(performance.now());
      return;
    }

    const id = requestAnimationFrame(callback);

    return () => {
      cancelAnimationFrame(id);
    };
  }, [reduced, callback, ...deps]);
}

/**
 * Hook for transition end events
 */
export function useTransitionEnd(
  ref: React.RefObject<HTMLElement>,
  callback: (event: TransitionEvent) => void,
  deps: React.DependencyList = []
) {
  const reduced = useReduceMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (reduced) {
      // Execute callback immediately
      setTimeout(() => callback({} as TransitionEvent), 0);
      return;
    }

    element.addEventListener('transitionend', callback);

    return () => {
      element.removeEventListener('transitionend', callback);
    };
  }, [ref, reduced, callback, ...deps]);
}

/**
 * Hook for animation end events
 */
export function useAnimationEnd(
  ref: React.RefObject<HTMLElement>,
  callback: (event: AnimationEvent) => void,
  deps: React.DependencyList = []
) {
  const reduced = useReduceMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (reduced) {
      // Execute callback immediately
      setTimeout(() => callback({} as AnimationEvent), 0);
      return;
    }

    element.addEventListener('animationend', callback);

    return () => {
      element.removeEventListener('animationend', callback);
    };
  }, [ref, reduced, callback, ...deps]);
}

/**
 * Combined hook with all reduce motion utilities
 */
export function useReduceMotionManager() {
  const reduced = useReduceMotion();
  const scrollBehavior = useScrollBehavior();

  return {
    reduced,
    prefersReduced: reduced,
    scrollBehavior,
    getDuration: (base: number) => (reduced ? 0 : base),
    getConfig: (duration = 300, easing = 'ease-out', delay = 0) =>
      getAnimationConfig(duration, easing, delay),
    shouldAnimate: !reduced,
  };
}
