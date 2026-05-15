/**
 * Monogram typography — Italiana (monogram display) + Bodoni Moda (body
 * display) + Crimson Pro (prose) from Google Fonts.
 *
 * Loading strategy: lazy-attached the first time a Monogram surface mounts,
 * not in `index.html`. Keeps the bundle lean for non-Monogram trials.
 *
 * The app's CSP (vercel.json + src/config/security.ts) already permits
 * fonts.googleapis.com / fonts.gstatic.com, so no CSP change is required.
 */

export const MONOGRAM_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Italiana&family=Bodoni+Moda:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Crimson+Pro:ital,wght@0,400;0,500;1,400;1,500&display=swap';

/**
 * Monogram display family — used exclusively for the embossed letters and
 * any decorative initial-style flourish. Italiana has only a regular weight,
 * which is the intent.
 */
export const MONOGRAM_MONOGRAM_FAMILY = "'Italiana', 'Bodoni Moda', Georgia, serif";

/**
 * Display family — used for hero titles, section headings, large numerals.
 */
export const MONOGRAM_DISPLAY_FAMILY = "'Bodoni Moda', Georgia, 'Times New Roman', serif";

/**
 * Body family — used for prose, lists, labels.
 */
export const MONOGRAM_BODY_FAMILY = "'Crimson Pro', Georgia, 'Times New Roman', serif";

const MONOGRAM_FONT_LINK_ID = 'monogram-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call from the
 * top-level Monogram surface (landing page root, wizard completion). The
 * <link> intentionally persists on unmount — once a font resource is cached,
 * evicting the <link> only flushes the cache.
 */
export function ensureMonogramFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(MONOGRAM_FONT_LINK_ID)) return () => {};

  const preconnectGoogle = document.createElement('link');
  preconnectGoogle.rel = 'preconnect';
  preconnectGoogle.href = 'https://fonts.googleapis.com';
  document.head.appendChild(preconnectGoogle);

  const preconnectGstatic = document.createElement('link');
  preconnectGstatic.rel = 'preconnect';
  preconnectGstatic.href = 'https://fonts.gstatic.com';
  preconnectGstatic.crossOrigin = '';
  document.head.appendChild(preconnectGstatic);

  const fontLink = document.createElement('link');
  fontLink.id = MONOGRAM_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = MONOGRAM_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
