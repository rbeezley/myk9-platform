interface MagazinePullQuoteProps {
  /** The quote text. Quote marks are *not* added automatically — pass
   *  curly quotes in the string if you want them. */
  quote: string;
  /** Optional attribution. Rendered below the quote in tracked smallcaps.
   *  Omit entirely to render an anonymous pull quote. */
  attribution?: string | null;
  className?: string;
}

/**
 * Pull quote — the single most "magazine-y" element in the system.
 *
 * Visual contract (from the design handoff):
 * - Bordered top + bottom with a 1px `--mz-gold-2` rule
 * - A short 88px gold-gradient stripe sits on top of the top rule
 * - Quote body: Cormorant Garamond italic, 24–36px responsive
 * - Attribution: Inter Tight smallcaps, 11px tracked 0.32em, gold-3
 *
 * Used by the WelcomeSection in the landing page (full-width interruption
 * via `column-span: all`). If a host page has no `pullQuote` data to show,
 * it should not render this component at all — there is no muted fallback.
 */
export function MagazinePullQuote({ quote, attribution, className }: MagazinePullQuoteProps) {
  const classes = ['mz-pullquote', className ?? ''].filter(Boolean).join(' ');
  return (
    <blockquote className={classes}>
      <p className="mz-pullquote__text">{quote}</p>
      {attribution && <div className="mz-pullquote__attrib">{attribution}</div>}
    </blockquote>
  );
}
