import type { JSX, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GazetteHeadingProps {
  level: 1 | 2 | 3;
  children: ReactNode;
  /** Default false — italic Playfair drops to weight 400 with brown accent color. */
  italic?: boolean;
  className?: string;
  id?: string;
}

/**
 * Playfair Display heading. Levels map to the three masthead/section/body
 * scales used across the Gazette landing page. The `gz-h` class hooks into
 * gazette.css for sizing, italic styling, and `<em>` brown-accent treatment.
 *
 * Note: `<em>` children render in italic Playfair 400 weight + brown accent
 * automatically via the scoped CSS — callers can pass standard `<em>` tags
 * without inline styles.
 */
export function GazetteHeading({
  level,
  children,
  italic = false,
  className,
  id,
}: GazetteHeadingProps) {
  const Tag = (`h${level}` as 'h1' | 'h2' | 'h3') as keyof JSX.IntrinsicElements;
  const sizeClass = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';

  return (
    <Tag
      id={id}
      className={cn('gz-h', sizeClass, italic && 'italic', className)}
      style={italic ? { fontStyle: 'italic', fontWeight: 400 } : undefined}
    >
      {children}
    </Tag>
  );
}
