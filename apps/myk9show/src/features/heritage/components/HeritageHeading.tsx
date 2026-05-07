import type { ReactNode } from 'react';

type HeadingLevel = 1 | 2 | 3;

interface HeritageHeadingProps {
  level: HeadingLevel;
  children: ReactNode;
  italic?: boolean;
  className?: string;
}

/**
 * Cormorant Garamond display heading. `level` maps to the rendered tag
 * (`h1` / `h2` / `h3`) and to `.hl-heading.h{n}` size tokens.
 *
 * Use `italic` when the headline should read in the cursive italic face —
 * the handoff hero ("the *Spring Scent Work Trial*") uses italic on the
 * sport-name word, but in practice we use this prop on the entire heading
 * when the content is fully italicized; partial italics should be inline
 * `<em>` for semantic correctness.
 */
export function HeritageHeading({ level, children, italic, className }: HeritageHeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  const classes = ['hl-heading', `h${level}`, italic ? 'italic' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes}>{children}</Tag>;
}
