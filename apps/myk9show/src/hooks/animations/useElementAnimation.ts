import { useRef, useEffect, useCallback, useState, useMemo } from 'react';

export interface AnimationConfig {
  duration: number;
  easing: string;
  delay?: number;
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  iterations?: number | 'infinite';
}

export interface ElementAnimationOptions {
  triggerOnMount?: boolean;
  triggerOnVisible?: boolean;
  threshold?: number;
  rootMargin?: string;
}

const defaultConfig: AnimationConfig = {
  duration: 300,
  easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  fillMode: 'forwards',
  iterations: 1,
};

export function useElementAnimation(
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  config: Partial<AnimationConfig> = {},
  options: ElementAnimationOptions = {}
) {
  const elementRef = useRef<HTMLElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  const finalConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);
  const {
    triggerOnMount = false,
    triggerOnVisible = false,
    threshold = 0.1,
    rootMargin = '0px',
  } = options;

  // Animation function
  const animate = useCallback(async () => {
    if (!elementRef.current || isAnimating) return;

    setIsAnimating(true);

    try {
      // Cancel any existing animation
      if (animationRef.current) {
        animationRef.current.cancel();
      }

      // Create new animation
      animationRef.current = elementRef.current.animate(keyframes, {
        duration: finalConfig.duration,
        easing: finalConfig.easing,
        delay: finalConfig.delay,
        fill: finalConfig.fillMode,
        iterations: finalConfig.iterations === 'infinite' ? Infinity : finalConfig.iterations,
      });

      // Wait for animation to complete
      await animationRef.current.finished;
      setHasAnimated(true);
    } catch (error) {
      console.warn('Animation was cancelled or failed:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [keyframes, finalConfig, isAnimating]);

  // Reverse animation
  const reverse = useCallback(async () => {
    if (!animationRef.current || isAnimating) return;

    setIsAnimating(true);

    try {
      animationRef.current.reverse();
      await animationRef.current.finished;
    } catch (error) {
      console.warn('Reverse animation was cancelled or failed:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [isAnimating]);

  // Pause animation
  const pause = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.pause();
    }
  }, []);

  // Play animation
  const play = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.play();
    }
  }, []);

  // Cancel animation
  const cancel = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.cancel();
      setIsAnimating(false);
    }
  }, []);

  // Reset animation
  const reset = useCallback(() => {
    cancel();
    setHasAnimated(false);
  }, [cancel]);

  // Intersection Observer for visibility-based animation
  useEffect(() => {
    if (!triggerOnVisible || !elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            animate();
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(elementRef.current);

    return () => observer.disconnect();
  }, [triggerOnVisible, animate, hasAnimated, threshold, rootMargin]);

  // Trigger on mount
  useEffect(() => {
    if (triggerOnMount && !hasAnimated) {
      animate();
    }
  }, [triggerOnMount, animate, hasAnimated]);

  return {
    elementRef,
    animate,
    reverse,
    pause,
    play,
    cancel,
    reset,
    isAnimating,
    hasAnimated,
  };
}

// Predefined animation hooks
export function useFadeIn(config?: Partial<AnimationConfig>, options?: ElementAnimationOptions) {
  return useElementAnimation(
    [
      { opacity: 0 },
      { opacity: 1 },
    ],
    config,
    options
  );
}

export function useSlideIn(
  direction: 'left' | 'right' | 'up' | 'down' = 'up',
  config?: Partial<AnimationConfig>,
  options?: ElementAnimationOptions
) {
  const getTransform = () => {
    switch (direction) {
      case 'left':
        return 'translateX(-100%)';
      case 'right':
        return 'translateX(100%)';
      case 'up':
        return 'translateY(-100%)';
      case 'down':
        return 'translateY(100%)';
    }
  };

  return useElementAnimation(
    [
      { transform: getTransform(), opacity: 0 },
      { transform: 'translate(0)', opacity: 1 },
    ],
    config,
    options
  );
}

export function useScaleIn(config?: Partial<AnimationConfig>, options?: ElementAnimationOptions) {
  return useElementAnimation(
    [
      { transform: 'scale(0.8)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    config,
    options
  );
}

export function useRotateIn(config?: Partial<AnimationConfig>, options?: ElementAnimationOptions) {
  return useElementAnimation(
    [
      { transform: 'rotate(-180deg)', opacity: 0 },
      { transform: 'rotate(0deg)', opacity: 1 },
    ],
    config,
    options
  );
}

export function useBounce(config?: Partial<AnimationConfig>) {
  return useElementAnimation(
    [
      { transform: 'translateY(0)' },
      { transform: 'translateY(-10px)' },
      { transform: 'translateY(0)' },
    ],
    { ...config, iterations: 'infinite' }
  );
}

export function usePulse(config?: Partial<AnimationConfig>) {
  return useElementAnimation(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' },
    ],
    { ...config, iterations: 'infinite', duration: 2000 }
  );
}

// Stagger animation hook for animating multiple elements
export function useStaggerAnimation(
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  config: Partial<AnimationConfig> = {},
  staggerDelay: number = 100
) {
  const elementsRef = useRef<HTMLElement[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  const addElement = useCallback((element: HTMLElement | null) => {
    if (element && !elementsRef.current.includes(element)) {
      elementsRef.current.push(element);
    }
  }, []);

  const removeElement = useCallback((element: HTMLElement) => {
    elementsRef.current = elementsRef.current.filter(el => el !== element);
  }, []);

  const animateAll = useCallback(async () => {
    if (elementsRef.current.length === 0 || isAnimating) return;

    setIsAnimating(true);

    const finalConfig = { ...defaultConfig, ...config };
    const animations: Animation[] = [];

    try {
      elementsRef.current.forEach((element, index) => {
        const animation = element.animate(keyframes, {
          duration: finalConfig.duration,
          easing: finalConfig.easing,
          delay: (finalConfig.delay || 0) + (index * staggerDelay),
          fill: finalConfig.fillMode,
          iterations: finalConfig.iterations === 'infinite' ? Infinity : finalConfig.iterations,
        });
        animations.push(animation);
      });

      // Wait for all animations to complete
      await Promise.all(animations.map(anim => anim.finished));
    } catch (error) {
      console.warn('Stagger animation was cancelled or failed:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [keyframes, config, staggerDelay, isAnimating]);

  const cancelAll = useCallback(() => {
    elementsRef.current.forEach(element => {
      element.getAnimations().forEach(animation => animation.cancel());
    });
    setIsAnimating(false);
  }, []);

  return {
    addElement,
    removeElement,
    animateAll,
    cancelAll,
    isAnimating,
    elementCount: elementsRef.current.length,
  };
}