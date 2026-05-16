/**
 * Field Guide typography — IBM Plex Sans (display + body) + IBM Plex Mono
 * (every label, folio, chip, ID code, time, status) + IBM Plex Serif
 * (welcome prose + agreement block only).
 *
 * Loading strategy: lazy-attached the first time a Field Guide surface
 * mounts, not in `index.html`. Keeps the bundle lean for non-Field-Guide
 * trials.
 *
 * The app's CSP already permits fonts.googleapis.com / fonts.gstatic.com,
 * so no CSP change is required.
 */

export const FIELD_GUIDE_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Serif:wght@500;700&display=swap';

/** Display family — titles, hero, section heads. */
export const FIELD_GUIDE_DISPLAY_FAMILY = "'IBM Plex Sans', system-ui, sans-serif";

/** Body family — paragraph copy, table cells. Same family as display. */
export const FIELD_GUIDE_BODY_FAMILY = "'IBM Plex Sans', system-ui, sans-serif";

/** Mono family — every label, folio, chip, ID code, time, status. */
export const FIELD_GUIDE_MONO_FAMILY = "'IBM Plex Mono', ui-monospace, monospace";

/** Serif family — welcome prose + agreement block only. */
export const FIELD_GUIDE_SERIF_FAMILY = "'IBM Plex Serif', Georgia, serif";

const FIELD_GUIDE_FONT_LINK_ID = 'field-guide-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Call from the
 * top-level Field Guide surface (landing page root, wizard completion).
 * The <link> intentionally persists on unmount — once a font resource is
 * cached, evicting the <link> only flushes the cache.
 */
export function ensureFieldGuideFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(FIELD_GUIDE_FONT_LINK_ID)) return () => {};

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
  fontLink.id = FIELD_GUIDE_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = FIELD_GUIDE_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
