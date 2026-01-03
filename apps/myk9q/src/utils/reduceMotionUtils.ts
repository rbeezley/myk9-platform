/**
 * Reduce Motion Utilities
 *
 * Helpers for implementing and respecting reduced motion preferences
 * across the application. Supports both user settings and system preferences.
 */

// No longer depends on settingsStore - uses OS preference only

/**
 * Check if reduced motion should be applied
 * Based on OS system preference only
 */
export function shouldReduceMotion(): boolean {
  // Check system preference only
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  return false;
}

/**
 * Get animation duration based on reduce motion setting
 * Returns 0 for reduced motion, otherwise returns the provided duration
 */
export function getAnimationDuration(baseDuration: number): number {
  return shouldReduceMotion() ? 0 : baseDuration;
}

/**
 * Get transition duration string for CSS
 */
export function getTransitionDuration(baseMs: number): string {
  const duration = getAnimationDuration(baseMs);
  return duration === 0 ? '0ms' : `${duration}ms`;
}

/**
 * Animation configuration based on reduce motion setting
 */
export interface AnimationConfig {
  enabled: boolean;
  duration: number;
  easing: string;
  delay: number;
}

/**
 * Get animation configuration
 */
export function getAnimationConfig(
  baseDuration = 300,
  baseEasing = 'ease-out',
  baseDelay = 0
): AnimationConfig {
  const reduced = shouldReduceMotion();

  return {
    enabled: !reduced,
    duration: reduced ? 0 : baseDuration,
    easing: reduced ? 'linear' : baseEasing,
    delay: reduced ? 0 : baseDelay,
  };
}

/** Motion variant value types (number, string, or nested object for transforms) */
type MotionVariantValue = Record<string, string | number | Record<string, string | number>>;

/**
 * Framer Motion variants with reduce motion support
 */
export const createMotionVariants = (config: {
  initial?: MotionVariantValue;
  animate?: MotionVariantValue;
  exit?: MotionVariantValue;
  transition?: MotionVariantValue;
}) => {
  const reduced = shouldReduceMotion();

  if (reduced) {
    // Return instant transitions
    return {
      initial: config.initial || {},
      animate: config.animate || {},
      exit: config.exit || {},
      transition: { duration: 0 },
    };
  }

  return {
    initial: config.initial || {},
    animate: config.animate || {},
    exit: config.exit || {},
    transition: config.transition || {},
  };
};

/**
 * Common animation variants for reuse
 */
export const motionVariants = {
  fadeIn: createMotionVariants({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  }),

  slideUp: createMotionVariants({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3 },
  }),

  slideDown: createMotionVariants({
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3 },
  }),

  slideLeft: createMotionVariants({
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3 },
  }),

  slideRight: createMotionVariants({
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3 },
  }),

  scale: createMotionVariants({
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2 },
  }),

  expand: createMotionVariants({
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.3 },
  }),
};

/**
 * Get scroll behavior setting
 */
export function getScrollBehavior(): 'auto' | 'smooth' {
  return shouldReduceMotion() ? 'auto' : 'smooth';
}

/**
 * Smooth scroll with reduce motion support
 */
export function smoothScrollTo(
  element: HTMLElement | null,
  options?: ScrollIntoViewOptions
) {
  if (!element) return;

  const behavior = getScrollBehavior();

  element.scrollIntoView({
    behavior,
    block: 'start',
    inline: 'nearest',
    ...options,
  });
}

/**
 * Scroll to top with reduce motion support
 */
export function scrollToTop(smooth = true) {
  const behavior = smooth && !shouldReduceMotion() ? 'smooth' : 'auto';

  window.scrollTo({
    top: 0,
    left: 0,
    behavior,
  });
}

/**
 * CSS class helper for animations
 */
export function getAnimationClass(baseClass: string): string {
  return shouldReduceMotion() ? `${baseClass} no-animation` : baseClass;
}

/**
 * Spring animation config for react-spring or similar libraries
 */
export function getSpringConfig(preset: 'gentle' | 'wobbly' | 'stiff' | 'slow' = 'gentle') {
  const reduced = shouldReduceMotion();

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
}

/**
 * Intersection Observer options with reduce motion support
 */
export function getIntersectionObserverOptions(options: IntersectionObserverInit = {}): IntersectionObserverInit {
  const reduced = shouldReduceMotion();

  return {
    ...options,
    // For reduced motion, use immediate threshold
    threshold: reduced ? [1] : (options.threshold || [0, 0.5, 1]),
    rootMargin: reduced ? '0px' : (options.rootMargin || '50px'),
  };
}

/**
 * Debounced animation frame with reduce motion support
 */
export function requestAnimationFrameWithReduceMotion(callback: FrameRequestCallback): number {
  if (shouldReduceMotion()) {
    // Execute immediately for reduced motion
    callback(performance.now());
    return 0;
  }

  return requestAnimationFrame(callback);
}

/**
 * CSS animation event listeners with reduce motion handling
 */
export function addAnimationEndListener(
  element: HTMLElement,
  callback: (event: AnimationEvent) => void
): () => void {
  if (shouldReduceMotion()) {
    // Execute callback immediately with a synthetic event
    setTimeout(() => callback({} as AnimationEvent), 0);
    return () => {}; // No cleanup needed
  }

  element.addEventListener('animationend', callback);

  return () => {
    element.removeEventListener('animationend', callback);
  };
}

/**
 * CSS transition event listeners with reduce motion handling
 */
export function addTransitionEndListener(
  element: HTMLElement,
  callback: (event: TransitionEvent) => void
): () => void {
  if (shouldReduceMotion()) {
    // Execute callback immediately with a synthetic event
    setTimeout(() => callback({} as TransitionEvent), 0);
    return () => {}; // No cleanup needed
  }

  element.addEventListener('transitionend', callback);

  return () => {
    element.removeEventListener('transitionend', callback);
  };
}

/**
 * Hook-friendly function to subscribe to reduce motion changes
 * Listens to OS system preference only
 */
export function subscribeToReduceMotionChanges(callback: (reduced: boolean) => void): () => void {
  // Subscribe to system preference changes only
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleChange = (e: MediaQueryListEvent) => {
    callback(e.matches);
  };

  // Call immediately with current value
  callback(mediaQuery.matches);

  mediaQuery.addEventListener('change', handleChange);

  // Return cleanup function
  return () => {
    mediaQuery.removeEventListener('change', handleChange);
  };
}

/**
 * Get CSS variables for animations
 */
export function getAnimationCSSVars(): Record<string, string> {
  const config = getAnimationConfig();

  return {
    '--animation-duration': `${config.duration}ms`,
    '--animation-easing': config.easing,
    '--animation-delay': `${config.delay}ms`,
  };
}

/**
 * Apply animation CSS variables to element
 */
export function applyAnimationVars(element: HTMLElement): void {
  const vars = getAnimationCSSVars();

  Object.entries(vars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}
