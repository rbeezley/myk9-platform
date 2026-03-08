/**
 * FadeIn — viewport-triggered entrance animation.
 *
 * Wraps a section so it fades in (with optional slide-up) when the
 * element scrolls into view. Uses `whileInView` from framer-motion.
 *
 * Respects `prefers-reduced-motion` and renders children immediately
 * when the user has requested reduced motion.
 *
 * Usage:
 *   <FadeIn>
 *     <section>...</section>
 *   </FadeIn>
 *
 *   <FadeIn direction="left" delay={0.1}>
 *     <Card>...</Card>
 *   </FadeIn>
 */

import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

interface FadeInProps {
  children: ReactNode;
  /** Direction the element slides from. Defaults to `"up"`. */
  direction?: Direction;
  /** Extra delay in seconds before the animation starts. */
  delay?: number;
  /** Animation duration in seconds. Defaults to 0.4. */
  duration?: number;
  /** Distance in px for the slide. Defaults to 20. */
  distance?: number;
  /** Additional CSS class names. */
  className?: string;
  /** When true the animation only plays once (default true). */
  once?: boolean;
  /** IntersectionObserver `amount` threshold (0-1). Defaults to 0.15. */
  viewportAmount?: number;
}

const directionOffset: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  none: { x: 0, y: 0 },
};

export function FadeIn({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.4,
  distance = 20,
  className,
  once = true,
  viewportAmount = 0.15,
}: FadeInProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const offset = directionOffset[direction];

  return (
    <motion.div
      initial={{ opacity: 0, x: offset.x * distance, y: offset.y * distance }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, amount: viewportAmount }}
      transition={{
        duration,
        delay,
        ease: 'easeOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
