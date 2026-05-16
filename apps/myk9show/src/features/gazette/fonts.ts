/**
 * Gazette typography — Playfair Display + Source Serif 4 + IBM Plex Mono.
 *
 * The combined Google Fonts request bundles all three families and their
 * required weights/italics in a single CSS file. App CSP already permits
 * fonts.googleapis.com / fonts.gstatic.com (per the Heritage precedent).
 *
 * Loading strategy: lazy-attached the first time a Gazette surface mounts,
 * not in index.html. Same rationale as Heritage — keep the bundle lean for
 * trials that pick a different landing style.
 */

export const GAZETTE_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

export const GAZETTE_DISPLAY_FAMILY = "'Playfair Display', Georgia, serif";
export const GAZETTE_BODY_FAMILY = "'Source Serif 4', Georgia, serif";
export const GAZETTE_META_FAMILY = "'IBM Plex Mono', ui-monospace, monospace";

const GAZETTE_FONT_LINK_ID = 'gazette-google-fonts';

/**
 * Idempotently injects the Google Fonts <link> into <head>. Safe to call
 * repeatedly. Returns a no-op cleanup function for symmetry with useEffect.
 */
export function ensureGazetteFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(GAZETTE_FONT_LINK_ID)) return () => {};

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
  fontLink.id = GAZETTE_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = GAZETTE_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
