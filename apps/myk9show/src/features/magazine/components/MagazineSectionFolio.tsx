interface MagazineSectionFolioProps {
  /** Smallcaps eyebrow text — typically a kicker like "The bench" or "On the
   *  day". The CSS upper-cases and letter-spaces it, so pass natural
   *  sentence case. */
  label: string;
  className?: string;
}

/**
 * Magazine section folio — a smallcaps eyebrow label flanked by short gold-
 * gradient hairlines (`::before` and `::after` pseudos). Sits above every
 * section title in the design handoff.
 *
 * Cross-style note: Heritage uses `§ I / II / III` numerals; Magazine
 * replaces the numeric folio with a *named* kicker because the editorial
 * voice never numbers itself out loud. The visual role is the same — a
 * small marker that anchors each section heading.
 */
export function MagazineSectionFolio({ label, className }: MagazineSectionFolioProps) {
  const classes = ['mz-section-folio', className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <span className="mz-section-folio__label">{label}</span>
    </span>
  );
}
