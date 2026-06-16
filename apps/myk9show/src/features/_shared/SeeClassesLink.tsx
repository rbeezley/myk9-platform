import type { CSSProperties } from 'react';

interface SeeClassesLinkProps {
  /**
   * The registration wizard URL. The wizard's first step is class selection and
   * requires no payment to view, so it doubles as a no-commitment "preview the
   * classes" entry point.
   */
  entryWizardUrl: string | null | undefined;
  className?: string;
  style?: CSSProperties;
  label?: string;
}

// INTENT: let a cautious exhibitor judge whether a show fits their dog by previewing the
// offered classes BEFORE committing to the "Enter" CTA (UX-P2-04-EXP). The styled landings
// are each bespoke-themed, so this link inherits the surrounding text color (currentColor)
// to blend into every style; callers pass `className`/`style` for per-theme tuning.
export function SeeClassesLink({
  entryWizardUrl,
  className,
  style,
  label = 'See classes first',
}: SeeClassesLinkProps) {
  if (!entryWizardUrl) return null;
  return (
    <a
      href={entryWizardUrl}
      data-testid="see-classes-link"
      className={className}
      style={{
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
