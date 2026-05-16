/**
 * Poster typography — Archivo Black (display) + Inter Tight (body display)
 * + Inter (body) + IBM Plex Mono (mono).
 *
 * Loading strategy: lazy-attached the first time a Poster surface mounts,
 * not in `index.html`. Keeps the bundle lean for non-Poster trials.
 *
 * The app's CSP already permits fonts.googleapis.com / fonts.gstatic.com,
 * so no CSP change is required.
 *
 * Critical PDF caveat: Archivo Black crashes @react-pdf's CFF glyph parser.
 * The PDF code path uses `Inter Tight 800/900` as a substitute and never
 * registers Archivo Black with @react-pdf. Web surfaces can use Archivo
 * Black freely. See `entry-blank/sections/pdfPrimitives.tsx` for the
 * substitution comment.
 */

export const POSTER_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter+Tight:wght@500;700;800;900&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

/** Display family — hero title, section titles, capacity numbers, masthead. */
export const POSTER_DISPLAY_FAMILY = "'Archivo Black', system-ui, sans-serif";

/** Body-display family — sub-headlines, judge names in tabular contexts. */
export const POSTER_DISPLAY_TIGHT_FAMILY = "'Inter Tight', system-ui, sans-serif";

/** Body family — paragraph copy, fees rows, captions. */
export const POSTER_BODY_FAMILY = "'Inter', system-ui, sans-serif";

/** Mono family — top/bottom strips, section folios, status counters. */
export const POSTER_MONO_FAMILY = "'IBM Plex Mono', ui-monospace, monospace";

const POSTER_FONT_LINK_ID = 'poster-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call from the
 * top-level Poster surface (landing page root, wizard completion). The
 * <link> intentionally persists on unmount — once a font resource is
 * cached, evicting the <link> only flushes the cache.
 */
export function ensurePosterFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(POSTER_FONT_LINK_ID)) return () => {};

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
  fontLink.id = POSTER_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = POSTER_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
