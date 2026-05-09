export const HEADLINE_GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const HEADLINE_FONT_LINK_ID = 'headline-google-fonts';

export function ensureHeadlineFontsLoaded(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (document.getElementById(HEADLINE_FONT_LINK_ID)) return () => {};

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
  fontLink.id = HEADLINE_FONT_LINK_ID;
  fontLink.rel = 'stylesheet';
  fontLink.href = HEADLINE_GOOGLE_FONTS_HREF;
  document.head.appendChild(fontLink);

  return () => {};
}
