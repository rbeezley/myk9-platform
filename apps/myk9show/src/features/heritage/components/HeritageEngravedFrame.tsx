import type { ReactNode } from 'react';

interface HeritageEngravedFrameProps {
  children: ReactNode;
  /** Render the four claret corner dots. Default true; entry-blank §VI omits them. */
  withCorners?: boolean;
  className?: string;
}

/**
 * Engraved double-border wrapper: outer 1px ink, 6px gap, inner 1px ink,
 * with optional claret radial-gradient corner dots.
 *
 * The double-border effect is achieved with a real `border` plus a `::before`
 * pseudo-element inset 6px — this lets the corner dots sit on the outer
 * border without the inner border interfering.
 */
export function HeritageEngravedFrame({
  children,
  withCorners = true,
  className,
}: HeritageEngravedFrameProps) {
  const classes = ['hl-engraved', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {withCorners && (
        <>
          <span className="hl-corner tl" aria-hidden="true" />
          <span className="hl-corner tr" aria-hidden="true" />
          <span className="hl-corner bl" aria-hidden="true" />
          <span className="hl-corner br" aria-hidden="true" />
        </>
      )}
      {children}
    </div>
  );
}
