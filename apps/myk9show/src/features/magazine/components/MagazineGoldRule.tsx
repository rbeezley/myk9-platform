interface MagazineGoldRuleProps {
  /** Doubles the rule height from 1px to 2px. Used at section boundaries
   *  where the header band needs a stronger separator than the inline
   *  hairlines inside the section folio. */
  thick?: boolean;
  className?: string;
  /** Override the `role`. Defaults to `presentation` since the rule is
   *  decorative; consumers who use it as a meaningful divider can set
   *  `role="separator"`. */
  role?: 'presentation' | 'separator';
}

/**
 * A horizontal gold-gradient hairline rule.
 *
 * Implemented as a `<div>` (not `<hr>`) so the gradient renders reliably —
 * browsers paint the `<hr>` element with their own forced border styles
 * that often defeat `background: linear-gradient(...)`. A 1px-high `<div>`
 * with `background` is the email-safe and CSS-safe baseline.
 *
 * Cross-style note: Heritage uses an ornament rule with a centered `✦` glyph
 * and `transform: scaleX()` reveal animation; Magazine prefers an unbroken
 * gradient stripe because the editorial voice is quieter — no centerpieces.
 */
export function MagazineGoldRule({
  thick = false,
  className,
  role = 'presentation',
}: MagazineGoldRuleProps) {
  const classes = ['mz-gold-rule', thick ? 'mz-gold-rule--thick' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <div className={classes} role={role} aria-hidden={role === 'presentation'} />;
}
