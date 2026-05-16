interface MagazineCoverProps {
  /** Cover photograph URL. When null/undefined, the component renders a
   *  gradient placeholder with the club monogram and a caption explaining
   *  the asset is missing — the design intent is to make the *cost* of not
   *  uploading art visible (a gentle push to do so). */
  imageUrl?: string | null;
  /** Alt text for the cover photo. Required when imageUrl is supplied;
   *  ignored when rendering the placeholder. */
  alt?: string;
  /** Club monogram letters (1–3 chars). Used inside the placeholder only.
   *  Rendered as oversized italic Cormorant — a quiet but designed
   *  fallback. */
  monogramLetters: string;
  /** Caption rendered at the bottom-left of the photo. Optional; clubs that
   *  do not credit a photographer can omit. */
  caption?: string | null;
  /** Placeholder label override. Defaults to "Cover photograph · Club to
   *  supply" per the handoff. */
  placeholderLabel?: string;
  className?: string;
}

/**
 * 4:5 aspect photographic slot for the hero cover spread.
 *
 * Two render paths:
 * 1. **Image present** — renders `<img>` cropped to 4:5 with an optional
 *    overlay caption.
 * 2. **Image absent (placeholder)** — renders a gradient panel with the
 *    club monogram centered, a smallcaps "Cover photograph · Club to
 *    supply" label below, and the gradient overlay flares from the cover
 *    fallback ramp.
 *
 * The aspect-ratio is enforced in CSS (`aspect-ratio: 4 / 5`) so the slot
 * reserves space at all viewport widths — the layout never collapses when
 * the URL is null.
 *
 * NB: The image columns (`shows.magazine_cover_image_url`) require a future
 * migration documented in the PR description's Phase 3 wiring instructions.
 * Until that lands, every club renders the placeholder.
 */
export function MagazineCover({
  imageUrl,
  alt,
  monogramLetters,
  caption,
  placeholderLabel = 'Cover photograph · Club to supply',
  className,
}: MagazineCoverProps) {
  if (imageUrl) {
    const classes = ['mz-cover', className ?? ''].filter(Boolean).join(' ');
    return (
      <figure className={classes}>
        <img className="mz-cover__img" src={imageUrl} alt={alt ?? ''} />
        {caption && <figcaption className="mz-cover__caption">{caption}</figcaption>}
      </figure>
    );
  }

  const classes = ['mz-cover', 'mz-cover--placeholder', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <figure className={classes} aria-label="Cover photograph placeholder">
      <div className="mz-cover__placeholder-mark">
        <div className="mz-cover__monogram" aria-hidden="true">
          {monogramLetters}
        </div>
        <div className="mz-cover__placeholder-label">{placeholderLabel}</div>
      </div>
      {caption && <figcaption className="mz-cover__caption">{caption}</figcaption>}
    </figure>
  );
}
