/**
 * StickyShowBar — Slim sticky bar visible when ShowDayHero scrolls off-screen.
 *
 * Shows the 3 most critical facts: class name, ring (if available), estimated time.
 * Mobile-only (hidden on lg+ where the hero is always visible).
 * Uses IntersectionObserver on the heroRef to toggle visibility.
 */

import { type RefObject, useEffect, useState } from 'react';
import { cn, formatClassLabel } from '@/lib/utils';
import type { ShowDayClass } from '@/types/show-day-types';
import { Activity } from 'lucide-react';

interface StickyShowBarProps {
  /** The next-up class to display */
  nextUp: ShowDayClass | null;
  /** Ref to the ShowDayHero element — bar appears when this scrolls off-screen */
  heroRef: RefObject<HTMLDivElement | null>;
  /** Scroll back to the hero on tap */
  onTap?: () => void;
  className?: string;
}

export function StickyShowBar({ nextUp, heroRef, onTap, className }: StickyShowBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show bar when hero is NOT intersecting (scrolled off-screen)
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroRef]);

  if (!nextUp || !visible) return null;

  const classLabel = formatClassLabel(nextUp.element, nextUp.level, nextUp.className);

  const handleTap = () => {
    if (onTap) {
      onTap();
    } else {
      heroRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      className={cn(
        'fixed top-0 left-0 right-0 z-50 lg:hidden',
        'flex items-center gap-2 px-4 py-2.5 min-h-[40px]',
        'bg-background/95 backdrop-blur-md border-b border-border shadow-sm',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className
      )}
      aria-label={`Next up: ${classLabel}, estimated ${nextUp.estimatedTimeMinutes ?? '?'} minutes. Tap to scroll to details.`}
    >
      <Activity className="h-3.5 w-3.5 text-success-green flex-shrink-0" />
      <span className="font-semibold text-sm truncate">{classLabel}</span>
      {nextUp.estimatedTimeMinutes != null && (
        <span className="text-sm text-muted-foreground whitespace-nowrap ml-auto">
          ~{nextUp.estimatedTimeMinutes}m
        </span>
      )}
    </button>
  );
}
