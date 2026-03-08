/**
 * Page transition wrapper components.
 *
 * Wraps page content with a subtle fade + slide-up entrance animation.
 * Respects `prefers-reduced-motion` — when enabled the content renders
 * instantly without any animation.
 *
 * // INTENT: Animations are purposeful state-change indicators, never
 * // decorative. Keep durations short (200-300ms) so the UI feels
 * // responsive rather than sluggish. See docs/INTENT.md §3 "Calm Over Clever".
 */

import { type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
}

/** Default page entrance: fade + subtle slide-up */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const reduced = useReducedMotion();

  if (reduced) {
    return <>{children}</>;
  }

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: 'easeOut',
        opacity: { duration: 0.25 },
        y: { duration: 0.3 },
      }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

/** Simple fade (no vertical shift) */
export function FadeTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const reduced = useReducedMotion();

  if (reduced) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Slide transition (left/right) */
export function SlideTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const reduced = useReducedMotion();

  if (reduced) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -300, opacity: 0 }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 20,
        }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
