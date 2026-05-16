import type { ReactNode } from 'react';

type HeadingLevel = 1 | 2 | 3 | 4;

interface MagazineHeadingProps {
  level: HeadingLevel;
  children: ReactNode;
  /** Render the whole heading in italic. Use for hero / final-CTA where the
   *  entire title is italicized. Partial italics should be inline <em>. */
  italic?: boolean;
  className?: string;
}

const TAG: Record<HeadingLevel, 'h1' | 'h2' | 'h3' | 'h4'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
};

/**
 * Cormorant Garamond display heading. `level` controls both the rendered
 * HTML tag (`h1`–`h4`) and the corresponding `.mz-heading.h{n}` size token.
 *
 * For italic emphasis on a single word inside the heading (e.g. "Spring
 * *Scent Work*"), wrap the emphasized text in `<em className="em-gold">`;
 * the scoped CSS paints it `--mz-gold-3` and applies `font-style: italic`,
 * matching the design handoff's gold-clipped accent words.
 */
export function MagazineHeading({ level, children, italic, className }: MagazineHeadingProps) {
  const Tag = TAG[level];
  const classes = ['mz-heading', `h${level}`, italic ? 'italic' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes}>{children}</Tag>;
}
