/**
 * StaggeredGrid — staggered entrance animation for grid/list children.
 *
 * Each direct child fades in with a slight delay after the previous one,
 * creating a cascade effect when the grid first appears in the viewport.
 *
 * Respects `prefers-reduced-motion` — renders all children immediately
 * when the user has requested reduced motion.
 *
 * Usage:
 *   <StaggeredGrid className="grid grid-cols-3 gap-4">
 *     {items.map(item => <Card key={item.id}>...</Card>)}
 *   </StaggeredGrid>
 */

import { type ReactNode, Children, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface StaggeredGridProps {
  children: ReactNode;
  /** Additional CSS class names applied to the container. */
  className?: string;
  /** Delay between each child in seconds. Defaults to 0.06. */
  staggerDelay?: number;
  /** Animation duration per child in seconds. Defaults to 0.35. */
  duration?: number;
  /** Distance in px each child slides up from. Defaults to 16. */
  distance?: number;
  /** When true the animation only plays once (default true). */
  once?: boolean;
  /** IntersectionObserver `amount` threshold (0-1). Defaults to 0.05. */
  viewportAmount?: number;
}

const containerVariants = {
  hidden: {},
  visible: (staggerDelay: number) => ({
    transition: {
      staggerChildren: staggerDelay,
    },
  }),
};

const itemVariants = (duration: number, distance: number) => ({
  hidden: { opacity: 0, y: distance },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration,
      ease: 'easeOut' as const,
    },
  },
});

export function StaggeredGrid({
  children,
  className,
  staggerDelay = 0.06,
  duration = 0.35,
  distance = 16,
  once = true,
  viewportAmount = 0.05,
}: StaggeredGridProps) {
  const reduced = useReducedMotion();

  const variants = useMemo(() => itemVariants(duration, distance), [duration, distance]);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const childArray = Children.toArray(children);

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: viewportAmount }}
      custom={staggerDelay}
    >
      {childArray.map((child, index) => (
        // Wrapper motion.div is required for framer-motion stagger animations.
        // It participates in CSS grid as a grid item, which is the correct behavior.
        <motion.div key={index} variants={variants}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
