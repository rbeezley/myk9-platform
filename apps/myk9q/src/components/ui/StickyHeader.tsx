/* eslint-disable react-hooks/set-state-in-effect */
/**
 * StickyHeader Component - Migrated to Tailwind CSS
 *
 * A header that sticks to the top when scrolling past it.
 * Supports auto-hide on scroll down, show on scroll up.
 */

import { useState, useRef, useEffect, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface StickyHeaderProps {
  /** Header content */
  children: ReactNode;

  /** Enable sticky behavior */
  sticky?: boolean;

  /** Auto-hide on scroll down */
  autoHide?: boolean;

  /** Distance to scroll before hiding (px) */
  hideThreshold?: number;

  /** Z-index for the header */
  zIndex?: number;

  /** Additional className */
  className?: string;

  /** Callback when sticky state changes */
  onStickyChange?: (isSticky: boolean) => void;

  /** Callback when visibility changes (only with autoHide) */
  onVisibilityChange?: (isVisible: boolean) => void;
}

export function StickyHeader({
  children,
  sticky = true,
  autoHide = false,
  hideThreshold = 50,
  zIndex = 100,
  className,
  onStickyChange,
  onVisibilityChange,
}: StickyHeaderProps) {
  const [isSticky, setIsSticky] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const headerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastScrollYRef = useRef(0);
  const scrollDeltaRef = useRef(0);

  // Intersection Observer for sticky detection
  useEffect(() => {
    if (!sticky || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const newIsSticky = !entry.isIntersecting;

        if (newIsSticky !== isSticky) {
          setIsSticky(newIsSticky);
          onStickyChange?.(newIsSticky);
        }
      },
      {
        threshold: 0,
        rootMargin: '-1px 0px 0px 0px', // Trigger 1px before top
      }
    );

    observer.observe(sentinelRef.current);

    return () => observer.disconnect();
  }, [sticky, isSticky, onStickyChange]);

  // Auto-hide on scroll
  useEffect(() => {
    if (!autoHide) {
      setIsVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.pageYOffset;
      const delta = currentScrollY - lastScrollYRef.current;

      scrollDeltaRef.current += delta;
      lastScrollYRef.current = currentScrollY;

      // Scrolling down
      if (delta > 0 && scrollDeltaRef.current > hideThreshold) {
        if (isVisible) {
          setIsVisible(false);
          onVisibilityChange?.(false);
        }
        scrollDeltaRef.current = 0;
      }

      // Scrolling up
      if (delta < 0 && scrollDeltaRef.current < -10) {
        if (!isVisible) {
          setIsVisible(true);
          onVisibilityChange?.(true);
        }
        scrollDeltaRef.current = 0;
      }

      // At top of page, always show
      if (currentScrollY < 10) {
        setIsVisible(true);
        scrollDeltaRef.current = 0;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [autoHide, hideThreshold, isVisible, onVisibilityChange]);

  return (
    <>
      {/* Sentinel element for intersection observer */}
      {sticky && <div ref={sentinelRef} className="h-0 w-full" />}

      <div
        ref={headerRef}
        className={cn(
          // Base styles
          'w-full',
          'bg-[var(--card)]',
          'border-b border-[var(--border)]',
          'transition-all duration-300',
          // Sticky styles
          sticky && 'sticky top-0',
          // Sticky active state
          isSticky && [
            'backdrop-blur-xl',
            'bg-[var(--card)]/90',
            'shadow-[var(--token-shadow-md)]',
          ],
          // Hidden state (auto-hide)
          autoHide && !isVisible && '-translate-y-full opacity-0',
          className
        )}
        style={{ zIndex }}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Sticky Section Header
 *
 * For section headers within a scrollable container
 */
export interface StickySectionHeaderProps {
  /** Header content */
  children: ReactNode;

  /** Container element ref (defaults to window) */
  containerRef?: React.RefObject<HTMLElement>;

  /** Additional className */
  className?: string;

  /** Z-index */
  zIndex?: number;
}

export function StickySectionHeader({
  children,
  containerRef: _containerRef,
  className,
  zIndex = 10,
}: StickySectionHeaderProps) {
  return (
    <div
      className={cn(
        'sticky top-0',
        'bg-[var(--background)]',
        'py-2 px-4',
        'border-b border-[var(--border)]',
        'backdrop-blur-sm',
        className
      )}
      style={{ zIndex }}
    >
      {children}
    </div>
  );
}
