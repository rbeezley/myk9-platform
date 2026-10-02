/**
 * The one required marker (MYK9-931, M13): a visible asterisk hidden from
 * assistive tech, plus "(required)" for it. Hand-coded `<span>*</span>` reads
 * as "star" to a screen reader.
 */
export function RequiredMark() {
  return (
    <>
      <span className="text-destructive ml-0.5" aria-hidden="true">
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

/** The one optional marker: "(optional)" everywhere instead of three spellings. */
export function OptionalMark() {
  return <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>;
}

/** One-line legend for forms that carry required markers. */
export function RequiredLegend({ className }: { className?: string | undefined }) {
  return (
    <p className={className ?? 'text-xs text-muted-foreground'} data-testid="required-legend">
      <span className="text-destructive" aria-hidden="true">
        *
      </span>{' '}
      Required
    </p>
  );
}
