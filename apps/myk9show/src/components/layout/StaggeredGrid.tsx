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

import { type ReactNode, Children, isValidElement, useMemo } from 'react';
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

/** Children past this position enter with the same delay, so a long list never waits seconds. */
const MAX_STAGGER_STEPS = 12;

// Each child owns its entrance (MYK9-1549). A child that mounts after the
// grid's first paint (a filter added cards) used to inherit a container whose
// one-shot animation had already played, so it stayed at opacity 0 forever.
const itemVariants = (duration: number, distance: number, staggerDelay: number) => ({
  hidden: { opacity: 0, y: distance },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration,
      ease: 'easeOut' as const,
      delay: Math.min(index, MAX_STAGGER_STEPS) * staggerDelay,
    },
  }),
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

  const variants = useMemo(
    () => itemVariants(duration, distance, staggerDelay),
    [duration, distance, staggerDelay]
  );

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const childArray = Children.toArray(children);

  return (
    <div className={className}>
      {childArray.map((child, index) => (
        // Wrapper motion.div is required for the entrance animation. It
        // participates in CSS grid as a grid item, which is the correct behavior.
        // Keyed by the child's own key (its item id), never its position.
        <motion.div
          key={isValidElement(child) && child.key != null ? child.key : index}
          variants={variants}
          custom={index}
          initial="hidden"
          whileInView="visible"
          viewport={{ once, amount: viewportAmount }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
