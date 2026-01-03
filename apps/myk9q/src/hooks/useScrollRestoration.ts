/**
 * Scroll Restoration Hooks
 *
 * React hooks for managing scroll position restoration.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  saveScrollPosition,
  restoreScrollPosition,
  preventRubberBandScroll,
} from '@/utils/scrollUtils';

/**
 * Automatically save and restore scroll position for current route
 */
export function useScrollRestoration(
  options: {
    enabled?: boolean;
    smooth?: boolean;
    maxAge?: number;
    storageKey?: string;
  } = {}
) {
  const { enabled = true, smooth = false, maxAge = 30000, storageKey } = options;
  const location = useLocation();
  const key = storageKey || location.pathname;

  useEffect(() => {
    if (!enabled) return;

    // Restore scroll position when component mounts
    restoreScrollPosition(key, undefined, { smooth, maxAge });

    // Save scroll position when component unmounts
    return () => {
      saveScrollPosition(key);
    };
  }, [enabled, key, smooth, maxAge]);
}

/**
 * Save scroll position on unmount
 */
export function useSaveScrollPosition(key?: string) {
  const location = useLocation();
  const scrollKey = key || location.pathname;

  useEffect(() => {
    return () => {
      saveScrollPosition(scrollKey);
    };
  }, [scrollKey]);
}

/**
 * Restore scroll position on mount
 */
export function useRestoreScrollPosition(
  key?: string,
  options: {
    smooth?: boolean;
    maxAge?: number;
  } = {}
) {
  const location = useLocation();
  const scrollKey = key || location.pathname;
  const { smooth = false, maxAge = 30000 } = options;

  useEffect(() => {
    restoreScrollPosition(scrollKey, undefined, { smooth, maxAge });
  }, [scrollKey, smooth, maxAge]);
}

/**
 * Prevent rubber-band scroll on element
 */
export function usePreventRubberBand(elementRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const cleanup = preventRubberBandScroll(element);
    return cleanup;
  }, [elementRef]);
}

/**
 * Scroll to top when route changes
 */
export function useScrollToTop(options: { smooth?: boolean } = {}) {
  const { smooth = false } = options;
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, [location.pathname, smooth]);
}

/**
 * Track scroll direction
 */
export function useScrollDirection(elementRef?: React.RefObject<HTMLElement>): {
  direction: 'up' | 'down' | 'none';
  delta: number;
} {
  const directionRef = useRef<'up' | 'down' | 'none'>('none');
  const deltaRef = useRef(0);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const element = elementRef?.current;
    const target = element || window;

    const handleScroll = () => {
      const scrollTop = element
        ? element.scrollTop
        : window.pageYOffset || document.documentElement.scrollTop;

      const delta = scrollTop - lastScrollTopRef.current;

      if (delta > 0) {
        directionRef.current = 'down';
      } else if (delta < 0) {
        directionRef.current = 'up';
      } else {
        directionRef.current = 'none';
      }

      deltaRef.current = delta;
      lastScrollTopRef.current = scrollTop;
    };

    target.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', handleScroll);
    };
  }, [elementRef]);

  return {
    get direction() {
      return directionRef.current;
    },
    get delta() {
      return deltaRef.current;
    },
  };
}

/**
 * Detect if scrolled past threshold
 */
export function useScrollThreshold(
  threshold: number,
  elementRef?: React.RefObject<HTMLElement>
): boolean {
  const [isPast, setIsPast] = React.useState(false);

  useEffect(() => {
    const element = elementRef?.current;
    const target = element || window;

    const handleScroll = () => {
      const scrollTop = element
        ? element.scrollTop
        : window.pageYOffset || document.documentElement.scrollTop;

      setIsPast(scrollTop > threshold);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => {
      target.removeEventListener('scroll', handleScroll);
    };
  }, [threshold, elementRef]);

  return isPast;
}

/**
 * Get scroll percentage (0-100)
 */
export function useScrollPercentage(elementRef?: React.RefObject<HTMLElement>): number {
  const [percentage, setPercentage] = React.useState(0);

  useEffect(() => {
    const element = elementRef?.current;
    const target = element || window;

    const handleScroll = () => {
      const el = element || document.documentElement;
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight;
      const clientHeight = el.clientHeight;

      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) {
        setPercentage(0);
        return;
      }

      const pct = (scrollTop / maxScroll) * 100;
      setPercentage(pct);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => {
      target.removeEventListener('scroll', handleScroll);
    };
  }, [elementRef]);

  return percentage;
}

/**
 * Detect when element is in viewport
 */
export function useInViewport(
  elementRef: React.RefObject<HTMLElement>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isInViewport, setIsInViewport] = React.useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInViewport(entry.isIntersecting);
        });
      },
      { threshold: 0.1, ...options }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [elementRef, options]);

  return isInViewport;
}

/**
 * Lock scroll (prevent scrolling)
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const scrollY = window.pageYOffset;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';

      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}

/**
 * Smooth scroll to element
 */
export function useSmoothScrollTo() {
  return useCallback((elementOrY: HTMLElement | number, offset = 0) => {
    if (typeof elementOrY === 'number') {
      window.scrollTo({
        top: elementOrY,
        behavior: 'smooth',
      });
    } else {
      const rect = elementOrY.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = rect.top + scrollTop - offset;

      window.scrollTo({
        top: targetY,
        behavior: 'smooth',
      });
    }
  }, []);
}

// Need to import useState
import React from 'react';
