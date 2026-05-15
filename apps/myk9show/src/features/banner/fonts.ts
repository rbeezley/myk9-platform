/**
 * Banner typography — Inter Tight (display) + Inter (body) only.
 *
 * Loading strategy: lazy-attached the first time a Banner surface mounts,
 * not in `index.html`. Keeps the bundle lean for non-Banner trials.
 *
 * The app's CSP already permits fonts.googleapis.com / fonts.gstatic.com,
 * so no CSP change is required.
 *
 * Note: Inter Tight 900 below 16px on Windows ClearType renders slightly
 * muddy. The token system never asks for it below 18px so this isn't a
 * code-time concern, but flag it if the design ever shrinks display copy.
 */

export const BANNER_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;700;800;900&display=swap';

/** Display family — masthead, hero title, section folios, totals. */
export const BANNER_DISPLAY_FAMILY = "'Inter Tight', system-ui, sans-serif";

/** Body family — paragraph copy, labels, kickers, captions. */
export const BANNER_BODY_FAMILY = "'Inter', system-ui, sans-serif";

const BANNER_FONT_LINK_ID = 'banner-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call from the
 * top-level Banner surface (landing page root, wizard completion). The
 * <link> intentionally persists on unmount — once a font resource is
 * cached, evicting the <link> only flushes the cache.
 */
export function ensureBannerFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(BANNER_FONT_LINK_ID)) return () => {};

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
  fontLink.id = BANNER_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = BANNER_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
