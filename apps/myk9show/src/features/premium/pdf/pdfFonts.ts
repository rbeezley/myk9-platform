import { Font } from '@react-pdf/renderer';

// ─── Custom font registration ────────────────────────────────────────────────
//
// Real fonts make the difference between "office doc" and "designed magazine."
// We pull TTF files from Google Fonts via jsDelivr's GitHub mirror so there
// are no new npm dependencies. @react-pdf fetches once at first render and
// caches in-memory for subsequent renders.
//
// If a CDN fetch fails, @react-pdf falls back silently to Helvetica/Times.
// That's a graceful degradation — the layout still renders, just less
// striking — so we don't bubble font errors up to the user.

const FS = 'https://cdn.jsdelivr.net/npm/@fontsource';

Font.register({
  family: 'Inter',
  fonts: [
    { src: `${FS}/inter@5/files/inter-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/inter@5/files/inter-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/inter@5/files/inter-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

Font.register({
  family: 'Playfair Display',
  fonts: [
    {
      src: `${FS}/playfair-display@5/files/playfair-display-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/playfair-display@5/files/playfair-display-latin-700-normal.woff`,
      fontWeight: 700,
    },
    {
      src: `${FS}/playfair-display@5/files/playfair-display-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

Font.register({
  family: 'Lora',
  fonts: [
    { src: `${FS}/lora@5/files/lora-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/lora@5/files/lora-latin-700-normal.woff`, fontWeight: 700 },
    {
      src: `${FS}/lora@5/files/lora-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

Font.register({
  family: 'Cormorant Garamond',
  fonts: [
    {
      src: `${FS}/cormorant-garamond@5/files/cormorant-garamond-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/cormorant-garamond@5/files/cormorant-garamond-latin-700-normal.woff`,
      fontWeight: 700,
    },
    {
      src: `${FS}/cormorant-garamond@5/files/cormorant-garamond-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

// ─── New families for the 5 upcoming styles (Phase 1 registration) ──────────
// Token bundles for these styles are still stubbed (clones of monogram); the
// fonts are registered now so later phases just need to wire them in.

Font.register({
  family: 'Inter Tight',
  fonts: [
    {
      src: `${FS}/inter-tight@5/files/inter-tight-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/inter-tight@5/files/inter-tight-latin-500-normal.woff`,
      fontWeight: 500,
    },
    {
      src: `${FS}/inter-tight@5/files/inter-tight-latin-700-normal.woff`,
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: 'Archivo Black',
  fonts: [
    {
      src: `${FS}/archivo-black@5/files/archivo-black-latin-400-normal.woff`,
      fontWeight: 400,
    },
  ],
});

Font.register({
  family: 'IBM Plex Mono',
  fonts: [
    {
      src: `${FS}/ibm-plex-mono@5/files/ibm-plex-mono-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/ibm-plex-mono@5/files/ibm-plex-mono-latin-700-normal.woff`,
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: 'Source Serif 4',
  fonts: [
    {
      src: `${FS}/source-serif-4@5/files/source-serif-4-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/source-serif-4@5/files/source-serif-4-latin-700-normal.woff`,
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: 'EB Garamond',
  fonts: [
    {
      src: `${FS}/eb-garamond@5/files/eb-garamond-latin-400-normal.woff`,
      fontWeight: 400,
    },
    {
      src: `${FS}/eb-garamond@5/files/eb-garamond-latin-700-normal.woff`,
      fontWeight: 700,
    },
    {
      src: `${FS}/eb-garamond@5/files/eb-garamond-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

// Disable the default word-splitter so display text doesn't hyphenate at
// awkward places (e.g., across the centered cover headline). Guarded so
// partial Font mocks in unit tests don't trip on a missing method.
if (typeof Font.registerHyphenationCallback === 'function') {
  Font.registerHyphenationCallback(word => [word]);
}
