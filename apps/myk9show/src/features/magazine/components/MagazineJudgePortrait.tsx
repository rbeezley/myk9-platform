interface MagazineJudgePortraitProps {
  /** Portrait URL. Null/undefined renders the initials-on-gradient
   *  placeholder. */
  imageUrl?: string | null;
  /** Alt text. Required when imageUrl is supplied. */
  alt?: string;
  /** Judge initials (1–3 chars). Derived from full name by the calling
   *  section. Always rendered, even when the photo is present — sits in
   *  the bottom-left corner as a designed overlay. */
  initials: string;
  /** "Plate I", "Plate II" — the editorial plate caption rendered top-right.
   *  Pass the plate label, not the raw trial numerals. */
  plateLabel: string;
  className?: string;
}

/**
 * 4:5 aspect editorial-portrait slot for the JudgesSection. Mirrors the
 * MagazineCover render-paths: real image when present, gradient placeholder
 * with initials when absent.
 *
 * Differs from MagazineCover in two ways:
 * - **Different gradient angle** (`mz-portrait-fallback`, 160deg) so two
 *   placeholders side-by-side don't look identical
 * - **Initials always overlay** even when an image is present, sitting in
 *   the bottom-left as a designed accent. The handoff treats judges'
 *   photographs as portraits, not headshots — the initials caption is part
 *   of the composition, not just a fallback.
 *
 * The plate-label caption ("Plate I / Plate II") sits top-right and reads
 * like a museum-label tag.
 */
export function MagazineJudgePortrait({
  imageUrl,
  alt,
  initials,
  plateLabel,
  className,
}: MagazineJudgePortraitProps) {
  const base = imageUrl ? 'mz-judge-portrait' : 'mz-judge-portrait mz-judge-portrait--placeholder';
  const classes = [base, className ?? ''].filter(Boolean).join(' ');

  return (
    <figure className={classes} aria-label={imageUrl ? undefined : 'Judge portrait placeholder'}>
      {imageUrl && <img className="mz-judge-portrait__img" src={imageUrl} alt={alt ?? ''} />}
      <span className="mz-judge-portrait__caption">{plateLabel}</span>
      <span className="mz-judge-portrait__initials" aria-hidden="true">
        {initials}
      </span>
    </figure>
  );
}
