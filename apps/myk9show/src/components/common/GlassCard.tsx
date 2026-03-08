/**
 * GlassCard — glassmorphism card wrapper.
 *
 * Encapsulates the repeating glassmorphism card pattern used across
 * dashboard pages (ExhibitorDashboard, JudgeDashboard, etc.).
 *
 * Props:
 * - `hoverEffect` controls the hover interaction style:
 *   'lift' (default) — raises the card with a shadow
 *   'subtle' — a gentler lift
 *   'none' — no hover animation
 */

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type HoverEffect = 'lift' | 'subtle' | 'none';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hoverEffect?: HoverEffect;
  /** Custom overlay gradient class. Defaults to `"from-primary/5"`. */
  overlayGradient?: string;
}

const hoverClasses: Record<HoverEffect, string> = {
  lift: 'hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]',
  subtle: 'hover:shadow-lg hover:-translate-y-1',
  none: '',
};

export function GlassCard({
  children,
  className,
  onClick,
  hoverEffect = 'lift',
  overlayGradient = 'from-primary/5',
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500',
        hoverClasses[hoverEffect],
        className
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500',
          overlayGradient
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
