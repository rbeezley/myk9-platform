import { useRef, useEffect, useCallback, useState, useMemo } from 'react';

export interface ScrollAnimationConfig {
  threshold: number;
  rootMargin: string;
  triggerOnce: boolean;
  reverse: boolean;
}

export interface ScrollPosition {
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right' | null;
}

const defaultConfig: ScrollAnimationConfig = {
  threshold: 0.1,
  rootMargin: '0px',
  triggerOnce: true,
  reverse: false,
};

export function useScrollAnimation(
  config: Partial<ScrollAnimationConfig> = {}
) {
  const elementRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const finalConfig = useMemo(() => ({ ...defaultConfig, ...config }), [config]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const isIntersecting = entry.isIntersecting;
          
          if (isIntersecting) {
            setIsVisible(true);
            if (finalConfig.triggerOnce) {
              setHasTriggered(true);
            }
          } else if (finalConfig.reverse && !finalConfig.triggerOnce) {
            setIsVisible(false);
          }
        });
      },
      {
        threshold: finalConfig.threshold,
        rootMargin: finalConfig.rootMargin,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [finalConfig]);

  const reset = useCallback(() => {
    setIsVisible(false);
    setHasTriggered(false);
  }, []);

  return {
    elementRef,
    isVisible,
    hasTriggered,
    reset,
  };
}

// Hook for scroll position tracking
export function useScrollPosition() {
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    x: 0,
    y: 0,
    direction: null,
  });

  const [lastPosition, setLastPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let ticking = false;

    const updateScrollPosition = () => {
      const x = window.pageXOffset;
      const y = window.pageYOffset;

      let direction: ScrollPosition['direction'] = null;
      
      if (y > lastPosition.y) {
        direction = 'down';
      } else if (y < lastPosition.y) {
        direction = 'up';
      } else if (x > lastPosition.x) {
        direction = 'right';
      } else if (x < lastPosition.x) {
        direction = 'left';
      }

      setScrollPosition({ x, y, direction });
      setLastPosition({ x, y });
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollPosition);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastPosition]);

  return scrollPosition;
}

// Hook for scroll-based parallax effects
export function useParallax(speed: number = 0.5, direction: 'vertical' | 'horizontal' = 'vertical') {
  const elementRef = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    let ticking = false;

    const updateParallax = () => {
      const rect = element.getBoundingClientRect();
      const scrolled = direction === 'vertical' ? window.pageYOffset : window.pageXOffset;
      
      if (direction === 'vertical') {
        const yPos = -(rect.top + scrolled) * speed;
        setOffset(yPos);
      } else {
        const xPos = -(rect.left + scrolled) * speed;
        setOffset(xPos);
      }
      
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    updateParallax(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed, direction]);

  const getTransform = useCallback(() => {
    return direction === 'vertical' 
      ? `translateY(${offset}px)`
      : `translateX(${offset}px)`;
  }, [offset, direction]);

  return {
    elementRef,
    offset,
    getTransform,
  };
}

// Hook for scroll-triggered animations with progress
export function useScrollProgress(container?: React.RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;

    const updateProgress = () => {
      const element = container?.current || document.documentElement;
      const scrollTop = container?.current ? element.scrollTop : window.pageYOffset;
      const scrollHeight = element.scrollHeight - element.clientHeight;
      const progress = Math.min(scrollTop / scrollHeight, 1);
      
      setProgress(progress);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateProgress);
        ticking = true;
      }
    };

    const target = container?.current || window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    updateProgress(); // Initial calculation

    return () => target.removeEventListener('scroll', handleScroll);
  }, [container]);

  return progress;
}

// Hook for sticky elements with scroll animations
export function useScrollSticky(offset: number = 0) {
  const elementRef = useRef<HTMLElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const [originalTop, setOriginalTop] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Get initial position
    const rect = element.getBoundingClientRect();
    setOriginalTop(rect.top + window.pageYOffset);

    let ticking = false;

    const updateSticky = () => {
      const scrollTop = window.pageYOffset;
      const shouldBeSticky = scrollTop > originalTop - offset;
      
      setIsSticky(shouldBeSticky);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateSticky);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    updateSticky(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, [offset, originalTop]);

  const getStickyStyles = useCallback(() => {
    return isSticky
      ? {
          position: 'fixed' as const,
          top: offset,
          zIndex: 100,
        }
      : {};
  }, [isSticky, offset]);

  return {
    elementRef,
    isSticky,
    getStickyStyles,
  };
}

// Hook for scroll-based counter animations
export function useScrollCounter(
  end: number,
  start: number = 0,
  duration: number = 1000
) {
  const elementRef = useRef<HTMLElement>(null);
  const [count, setCount] = useState(start);
  const [isAnimating, setIsAnimating] = useState(false);

  const startAnimation = useCallback(() => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    const startTime = Date.now();
    const range = end - start;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = start + (range * easeOut);
      
      setCount(Math.floor(current));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(end);
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animate);
  }, [start, end, duration, isAnimating]);

  // Use intersection observer to trigger animation
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startAnimation();
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [startAnimation]);

  const reset = useCallback(() => {
    setCount(start);
    setIsAnimating(false);
  }, [start]);

  return {
    elementRef,
    count,
    isAnimating,
    startAnimation,
    reset,
  };
}