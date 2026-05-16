import type { ReactNode } from 'react';

interface MagazineDropCapProps {
  /** Paragraph text. The first character is rendered as the drop cap; the
   *  rest flows around it. Pass plain text — the component will not
   *  interpret embedded markup. */
  children: string;
  /** Override styling for surrounding paragraph. Common use: `text-base` /
   *  `text-lg` overrides when the host section sets a non-default body
   *  size. */
  className?: string;
}

/**
 * Drop-cap paragraph: floats the first character as an oversized Cormorant
 * Garamond gold-3 letter, then renders the rest inline.
 *
 * Edge cases:
 * - Empty string → renders nothing (no broken float).
 * - Single character → renders the lone letter as a drop cap with no body
 *   text following it (still valid editorial layout).
 * - Below 640px the CSS removes the float entirely (see magazine.css) so
 *   the lead letter sits inline at 56px instead of colliding with the
 *   following paragraph at narrow widths.
 *
 * The `<span>` host uses `aria-hidden` on the lead letter only; the full
 * text remains readable because the drop cap *is* the first character of
 * the paragraph — screen readers re-read it via the visually-hidden span.
 */
export function MagazineDropCap({ children, className }: MagazineDropCapProps): ReactNode {
  if (!children) return null;

  const firstChar = children.charAt(0);
  const rest = children.slice(1);

  return (
    <p className={className}>
      {/* The drop-cap span carries the visual letter. Setting it aria-hidden
       *  prevents double-announce — the screen reader still reads the full
       *  paragraph via the visually-hidden mirror span below. */}
      <span className="mz-drop-cap" aria-hidden="true">
        {firstChar}
      </span>
      <span className="sr-only">{firstChar}</span>
      {rest}
    </p>
  );
}
