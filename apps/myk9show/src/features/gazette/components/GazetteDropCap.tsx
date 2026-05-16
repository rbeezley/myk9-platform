import type { ReactNode } from 'react';

interface GazetteDropCapProps {
  /** Source text — the first character is wrapped as a floated drop cap and
   *  the remainder renders inline as the paragraph body. */
  children: string;
  /** Trailing content after the lead string. */
  rest?: ReactNode;
}

/**
 * Extracts the first letter or digit from `children`, renders it as a 72px
 * floated Playfair drop cap, and prints the remainder as the rest of the
 * paragraph. Any leading whitespace or punctuation (e.g. a quotation mark
 * opening the lead) is preserved inline rather than promoted into the cap —
 * a 72px floating `"` glyph looks like a typo.
 *
 * Why a span, not `::first-letter`? Per the reconciliation notes Q3:
 * `::first-letter` doesn't accept `float` reliably across browsers and
 * floats poorly out of `column-count` flows. A real `<span>` is what every
 * newspaper layout shipped to web has used since 2007.
 *
 * The cap stays in the screen-reader text flow (no `aria-hidden`) so
 * "F" + "or seventy-nine years…" reads as "For seventy-nine years…".
 *
 * Empty / whitespace-only / punctuation-only input falls through to a
 * single paragraph with no cap — better than rendering an orphan glyph.
 */
export function GazetteDropCap({ children, rest }: GazetteDropCapProps) {
  const trimmed = children.trimStart();
  if (!trimmed) {
    return <p>{rest}</p>;
  }

  // Walk forward until the first letter or digit. `\p{L}` matches any
  // Unicode letter so accented characters in club names render correctly.
  const chars = Array.from(trimmed);
  const capIndex = chars.findIndex(c => /[\p{L}\p{N}]/u.test(c));
  if (capIndex === -1) {
    // No letters or digits at all — emit body only, no cap.
    return <p>{trimmed}{rest}</p>;
  }

  const prefix = chars.slice(0, capIndex).join('');
  const capChar = chars[capIndex];
  const tail = chars.slice(capIndex + 1).join('');

  return (
    <p>
      {prefix}
      <span className="gz-dropcap">{capChar}</span>
      {tail}
      {rest}
    </p>
  );
}
