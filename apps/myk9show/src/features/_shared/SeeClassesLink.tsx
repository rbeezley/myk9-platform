import type { CSSProperties } from 'react';

interface SeeClassesLinkProps {
  /**
   * PUBLIC URL where the offered classes can be previewed (the trial details page).
   * Must NOT be the auth-gated registration wizard — a signed-out visitor would be
   * redirected to /sign-in. Use `publicClassesHref()` to build it.
   */
  href: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

// INTENT: let a cautious exhibitor judge whether a show fits their dog by previewing the
// offered classes BEFORE committing to the "Enter" CTA (UX-P2-04-EXP). The styled landings
// are each bespoke-themed, so this link inherits the surrounding text color (currentColor)
// to blend into every style; callers pass `className`/`style` for per-theme tuning.
export function SeeClassesLink({
  href,
  className,
  style,
  label = 'See classes first',
}: SeeClassesLinkProps) {
  if (!href) return null;
  return (
    <a
      href={href}
      data-testid="see-classes-link"
      className={className}
      style={{
        // Tap target: keep this shared CTA above the 44px exhibitor touch floor
        // on every themed landing. Defaults precede `...style` so per-theme
        // callers can still override color/font/etc.
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        color: 'currentColor',
        textDecoration: 'underline',
        textUnderlineOffset: '4px',
        opacity: 0.85,
        fontSize: 14,
        ...style,
      }}
    >
      {label}
    </a>
  );
}
