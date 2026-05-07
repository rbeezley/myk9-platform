/**
 * Heritage typography — Cormorant Garamond + EB Garamond from Google Fonts.
 *
 * The handoff README specifies a single combined `<link>` for both families,
 * loaded with `display=swap`. The app's existing CSP (`vercel.json` +
 * `src/config/security.ts`) already permits `fonts.googleapis.com` /
 * `fonts.gstatic.com`, so no CSP change is required (per pre-flight Q8).
 *
 * Loading strategy: lazy-attached the first time a Heritage surface mounts,
 * not in `index.html`. Keeps the bundle lean for non-Heritage trials, which
 * are the majority of public traffic today.
 */

export const HERITAGE_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap';

/**
 * Display family — used for the hero title, section headings, ornaments.
 * Georgia is the closest commonly-installed serif for the FOUT swap window.
 */
export const HERITAGE_DISPLAY_FAMILY =
  "'Cormorant Garamond', 'EB Garamond', Georgia, 'Times New Roman', serif";

/**
 * Body family — used for prose, lists, labels.
 */
export const HERITAGE_BODY_FAMILY = "'EB Garamond', Georgia, 'Times New Roman', serif";

const HERITAGE_FONT_LINK_ID = 'heritage-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call this from
 * the top-level Heritage surface (landing page root, wizard completion).
 * Returns a no-op cleanup function for symmetry with `useEffect`-style use,
 * though the link is intentionally NOT removed on unmount — once a font
 * resource is in the cache, evicting the <link> only flushes the cache.
 */
export function ensureHeritageFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(HERITAGE_FONT_LINK_ID)) return () => {};

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
  fontLink.id = HERITAGE_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = HERITAGE_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
