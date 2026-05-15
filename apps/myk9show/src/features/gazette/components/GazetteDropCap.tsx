import type { ReactNode } from 'react';

interface GazetteDropCapProps {
  /** Source text — the first character is wrapped as a floated drop cap and
   *  the remainder renders inline as the paragraph body. */
  children: string;
  /** Trailing content after the lead string. */
  rest?: ReactNode;
}

/**
 * Extracts the first character from `children`, renders it as a 72px floated
 * Playfair drop cap, and prints the remainder as the rest of the paragraph.
 *
 * Why a span, not `::first-letter`? Per the reconciliation notes Q3:
 * `::first-letter` doesn't accept `float` reliably across browsers and
 * floats poorly out of `column-count` flows. A real `<span>` is what every
 * newspaper layout shipped to web has used since 2007.
 *
 * Empty / whitespace-only input falls through to a single paragraph with no
 * cap — better than rendering an orphan glyph.
 */
export function GazetteDropCap({ children, rest }: GazetteDropCapProps) {
  const trimmed = children.trimStart();
  if (!trimmed) {
    return <p>{rest}</p>;
  }

  const [first, ...remaining] = Array.from(trimmed);
  const body = remaining.join('');

  return (
    <p>
      <span className="gz-dropcap" aria-hidden={false}>
        {first}
      </span>
      {body}
      {rest}
    </p>
  );
}
