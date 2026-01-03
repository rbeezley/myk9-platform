/**
 * Scroll Utilities
 *
 * Advanced scrolling behaviors for mobile and desktop.
 * Handles rubber-band prevention, scroll restoration, and smooth scrolling.
 */

import { logger } from '@/utils/logger';

interface ScrollPosition {
  x: number;
  y: number;
  timestamp: number;
}

interface ScrollMemory {
  [key: string]: ScrollPosition;
}

// Store scroll positions for restoration
const scrollMemory: ScrollMemory = {};

// Load saved positions from sessionStorage
const STORAGE_KEY = 'myK9Q_scroll_positions';
try {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    Object.assign(scrollMemory, JSON.parse(saved));
  }
} catch (error) {
  logger.warn('[Scroll] Failed to load scroll positions:', error);
}

/**
 * Prevent rubber-band scroll on iOS
 *
 * iOS allows elastic "bounce" scrolling which can be disorienting
 * and interfere with pull-to-refresh. This prevents it.
 */
export function preventRubberBandScroll(element: HTMLElement): () => void {
  let startY = 0;
  let isScrolling = false;

  const handleTouchStart = (e: TouchEvent) => {
    startY = e.touches[0].pageY;
    isScrolling = false;
  };

  const handleTouchMove = (e: TouchEvent) => {
    const currentY = e.touches[0].pageY;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const deltaY = currentY - startY;

    // Check if scrolling
    if (!isScrolling) {
      isScrolling = Math.abs(deltaY) > 5;
    }

    // At top and trying to scroll up
    const isAtTop = scrollTop <= 0;
    const isScrollingUp = deltaY > 0;

    // At bottom and trying to scroll down
    const isAtBottom = scrollTop + clientHeight >= scrollHeight;
    const isScrollingDown = deltaY < 0;

    // Prevent rubber-band at boundaries
    if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    isScrolling = false;
  };

  // Passive: false is required to call preventDefault
  element.addEventListener('touchstart', handleTouchStart, { passive: false });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Cleanup function
  return () => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
  };
}

/**
 * Save scroll position for a key (usually route path)
 */
export function saveScrollPosition(key: string, element?: HTMLElement): void {
  const el = element || document.documentElement;
  const position: ScrollPosition = {
    x: el.scrollLeft,
    y: el.scrollTop,
    timestamp: Date.now(),
  };

  scrollMemory[key] = position;

  // Persist to sessionStorage
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scrollMemory));
  } catch (error) {
    logger.warn('[Scroll] Failed to save scroll position:', error);
  }
}

/**
 * Restore scroll position for a key
 */
export function restoreScrollPosition(
  key: string,
  element?: HTMLElement,
  options: {
    smooth?: boolean;
    maxAge?: number;
    fallback?: { x: number; y: number };
  } = {}
): boolean {
  const { smooth = false, maxAge = 30000, fallback = { x: 0, y: 0 } } = options;
  const position = scrollMemory[key];

  if (!position) {
    // Restore to fallback
    const el = element || document.documentElement;
    el.scrollTo({
      left: fallback.x,
      top: fallback.y,
      behavior: smooth ? 'smooth' : 'auto',
    });
    return false;
  }

  // Check if position is too old
  const age = Date.now() - position.timestamp;
  if (age > maxAge) {
    delete scrollMemory[key];
    return false;
  }

  const el = element || document.documentElement;
  el.scrollTo({
    left: position.x,
    top: position.y,
    behavior: smooth ? 'smooth' : 'auto',
  });

  return true;
}

/**
 * Clear scroll position for a key
 */
export function clearScrollPosition(key: string): void {
  delete scrollMemory[key];

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(scrollMemory));
  } catch (error) {
    logger.warn('[Scroll] Failed to clear scroll position:', error);
  }
}

/**
 * Clear all scroll positions
 */
export function clearAllScrollPositions(): void {
  Object.keys(scrollMemory).forEach(key => delete scrollMemory[key]);

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    logger.warn('[Scroll] Failed to clear all scroll positions:', error);
  }
}

/**
 * Get scroll position for a key
 */
export function getScrollPosition(key: string): ScrollPosition | null {
  return scrollMemory[key] || null;
}

/**
 * Check if element is scrollable
 */
export function isScrollable(element: HTMLElement): {
  vertical: boolean;
  horizontal: boolean;
} {
  const hasVerticalScroll = element.scrollHeight > element.clientHeight;
  const hasHorizontalScroll = element.scrollWidth > element.clientWidth;

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;

  const canScrollVertically =
    hasVerticalScroll &&
    (overflowY === 'scroll' || overflowY === 'auto' || overflowY === 'overlay');

  const canScrollHorizontally =
    hasHorizontalScroll &&
    (overflowX === 'scroll' || overflowX === 'auto' || overflowX === 'overlay');

  return {
    vertical: canScrollVertically,
    horizontal: canScrollHorizontally,
  };
}

/**
 * Scroll to element with offset
 */
export function scrollToElement(
  element: HTMLElement,
  options: {
    behavior?: ScrollBehavior;
    block?: ScrollLogicalPosition;
    inline?: ScrollLogicalPosition;
    offset?: number;
  } = {}
): void {
  const { behavior = 'smooth', block: _block = 'start', inline: _inline = 'nearest', offset = 0 } = options;

  // Get element position
  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Calculate scroll position with offset
  const targetY = rect.top + scrollTop - offset;

  window.scrollTo({
    top: targetY,
    behavior,
  });
}

/**
 * Smooth scroll with easing
 */
export function smoothScrollTo(
  targetY: number,
  options: {
    duration?: number;
    easing?: (t: number) => number;
    onComplete?: () => void;
  } = {}
): void {
  const { duration = 500, easing = easeInOutCubic, onComplete } = options;

  const startY = window.pageYOffset;
  const distance = targetY - startY;
  const startTime = performance.now();

  function step(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    window.scrollTo(0, startY + distance * easedProgress);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  }

  requestAnimationFrame(step);
}

/**
 * Easing function: easeInOutCubic
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Lock scroll (prevent scrolling)
 */
let scrollLocked = false;
let scrollLockPosition = 0;

export function lockScroll(): void {
  if (scrollLocked) return;

  scrollLockPosition = window.pageYOffset;
  scrollLocked = true;

  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollLockPosition}px`;
  document.body.style.width = '100%';
}

/**
 * Unlock scroll (re-enable scrolling)
 */
export function unlockScroll(): void {
  if (!scrollLocked) return;

  scrollLocked = false;

  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';

  window.scrollTo(0, scrollLockPosition);
}

/**
 * Check if scroll is locked
 */
export function isScrollLocked(): boolean {
  return scrollLocked;
}

/**
 * Detect scroll direction
 */
export function detectScrollDirection(element?: HTMLElement): {
  direction: 'up' | 'down' | 'none';
  delta: number;
  cleanup: () => void;
} {
  const el = element || window;
  let lastScrollTop = 0;
  let direction: 'up' | 'down' | 'none' = 'none';
  let delta = 0;

  const handleScroll = () => {
    const scrollTop = element
      ? (element as HTMLElement).scrollTop
      : window.pageYOffset || document.documentElement.scrollTop;

    delta = scrollTop - lastScrollTop;

    if (delta > 0) {
      direction = 'down';
    } else if (delta < 0) {
      direction = 'up';
    } else {
      direction = 'none';
    }

    lastScrollTop = scrollTop;
  };

  el.addEventListener('scroll', handleScroll, { passive: true });

  return {
    get direction() {
      return direction;
    },
    get delta() {
      return delta;
    },
    cleanup: () => {
      el.removeEventListener('scroll', handleScroll);
    },
  };
}

/**
 * Animate scroll with momentum (physics-based)
 */
export function scrollWithMomentum(
  startY: number,
  velocity: number,
  options: {
    friction?: number;
    minVelocity?: number;
    onUpdate?: (y: number) => void;
    onComplete?: () => void;
  } = {}
): () => void {
  const { friction = 0.95, minVelocity = 0.1, onUpdate, onComplete } = options;

  let currentY = startY;
  let currentVelocity = velocity;
  let rafId: number;

  function step() {
    currentVelocity *= friction;
    currentY += currentVelocity;

    onUpdate?.(currentY);
    window.scrollTo(0, currentY);

    if (Math.abs(currentVelocity) > minVelocity) {
      rafId = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  }

  rafId = requestAnimationFrame(step);

  // Return cancel function
  return () => {
    cancelAnimationFrame(rafId);
  };
}

/**
 * Get scroll percentage (0-100)
 */
export function getScrollPercentage(element?: HTMLElement): number {
  const el = element || document.documentElement;
  const scrollTop = el.scrollTop;
  const scrollHeight = el.scrollHeight;
  const clientHeight = el.clientHeight;

  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return 0;

  return (scrollTop / maxScroll) * 100;
}

/**
 * Check if element is in viewport
 */
export function isInViewport(
  element: HTMLElement,
  options: {
    threshold?: number;
    rootMargin?: string;
  } = {}
): boolean {
  const { threshold = 0 } = options;
  const rect = element.getBoundingClientRect();

  return (
    rect.top >= -threshold &&
    rect.left >= -threshold &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + threshold &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + threshold
  );
}

/**
 * Observe element visibility in viewport
 */
export function observeElementVisibility(
  element: HTMLElement,
  callback: (isVisible: boolean) => void,
  options: IntersectionObserverInit = {}
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        callback(entry.isIntersecting);
      });
    },
    { threshold: 0.1, ...options }
  );

  observer.observe(element);

  return () => observer.disconnect();
}
