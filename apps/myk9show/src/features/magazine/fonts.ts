/**
 * Magazine typography — Cormorant Garamond (display), Source Serif 4 (body),
 * Inter Tight (meta) — loaded as one combined Google Fonts <link>.
 *
 * The app's CSP already allows fonts.googleapis.com / fonts.gstatic.com, so
 * no CSP change is required. The <link> is lazy-injected on first mount of
 * a Magazine surface so non-Magazine traffic (still the vast majority) does
 * not pay the cost.
 *
 * The combined family list mirrors the design handoff HTML mock exactly —
 * Cormorant Garamond carries the editorial italic flair, Source Serif 4 sits
 * underneath as the workhorse body face (variable optical for clean reading
 * at small sizes), and Inter Tight is the lone sans, used only for smallcaps
 * eyebrow labels.
 */

export const MAGAZINE_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400&family=Inter+Tight:wght@500;700&display=swap';

/**
 * Display family — used for hero title, section titles, drop caps, pull
 * quotes, italic emphasis text. Cormorant Garamond carries the editorial
 * voice; the EB Garamond + Georgia fallbacks keep the same proportions
 * during the FOUT window.
 */
export const MAGAZINE_DISPLAY_FAMILY =
  "'Cormorant Garamond', 'EB Garamond', Georgia, 'Times New Roman', serif";

/**
 * Body family — Source Serif 4 with variable optical sizing. Holds the
 * multi-column Welcome prose, card body, list rows.
 *
 * Do NOT substitute Cormorant at body sizes — its hairlines disappear below
 * ~20px and the result is hard to read. The two-serif system is the design
 * intent, not a compromise.
 */
export const MAGAZINE_BODY_FAMILY = "'Source Serif 4', Georgia, 'Times New Roman', serif";

/**
 * Meta family — Inter Tight 500. The only sans-serif in the Magazine system,
 * used exclusively for tracked smallcaps labels (section eyebrows, table
 * column headers, byline pieces).
 */
export const MAGAZINE_META_FAMILY = "'Inter Tight', system-ui, sans-serif";

const MAGAZINE_FONT_LINK_ID = 'magazine-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call from the
 * top-level Magazine surface (landing page root, wizard completion). Returns
 * a no-op cleanup for `useEffect`-style use; once a font lands in the cache
 * we leave it there.
 */
export function ensureMagazineFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(MAGAZINE_FONT_LINK_ID)) return () => {};

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
  fontLink.id = MAGAZINE_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = MAGAZINE_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
