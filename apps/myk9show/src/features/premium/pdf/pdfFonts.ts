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

// Note: Archivo Black and Oswald both use CFF outlines which crash @react-pdf's
// glyph-metrics parser. The Poster style uses Inter Tight 700 (TrueType, already
// registered above) for its display font — condensed and heavy enough for the
// poster aesthetic without the CFF rendering issue.

// IBM Plex Mono (@fontsource v4 and v5) triggers @react-pdf's glyph-metrics
// parser to overflow — RangeError in _getCBox/_getMetrics/advanceWidth —
// on every use of the family, crashing Poster and Field Guide entirely.
// Root cause is something in IBM Plex Mono's specific glyf table structure
// that @react-pdf/fontkit misreads at render time.
// JetBrains Mono is purpose-built for code/reference display, has nearly
// identical proportions and weight, and is available as a compact TrueType
// WOFF on @fontsource that @react-pdf parses cleanly.
// Registered as 'IBM Plex Mono' so Poster eyebrow caps and Field Guide
// §-prefixed rows pick it up transparently — no call-site changes needed.
Font.register({
  family: 'IBM Plex Mono',
  fonts: [
    { src: `${FS}/jetbrains-mono@5/files/jetbrains-mono-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/jetbrains-mono@5/files/jetbrains-mono-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

// Field Guide style needs IBM Plex Sans + IBM Plex Serif. Both are TTF on
// @fontsource so they parse cleanly through @react-pdf/fontkit (unlike IBM
// Plex Mono, which had to be aliased to JetBrains Mono above). The serif is
// used in exactly two PDF surfaces: the landing-page welcome prose and the
// entry-blank agreement block. Keep weights minimal — only the ones the
// Field Guide visual register actually calls for.
Font.register({
  family: 'IBM Plex Sans',
  fonts: [
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-600-normal.woff`, fontWeight: 600 },
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-700-normal.woff`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBM Plex Serif',
  fonts: [
    { src: `${FS}/ibm-plex-serif@5/files/ibm-plex-serif-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/ibm-plex-serif@5/files/ibm-plex-serif-latin-700-normal.woff`, fontWeight: 700 },
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
    {
      src: `${FS}/source-serif-4@5/files/source-serif-4-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
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

// Monogram visual system (Bodoni Moda display + Italiana decorative initials +
// Crimson Pro body) — added when the polished Monogram entry-blank shipped.
// Legacy MONOGRAM_TOKENS in pdfTokens.ts still uses Playfair/Lora for the
// premium PDF cover; that's a separate refresh tracked as an open question
// in the Monogram reconciliation notes.
Font.register({
  family: 'Bodoni Moda',
  fonts: [
    { src: `${FS}/bodoni-moda@5/files/bodoni-moda-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/bodoni-moda@5/files/bodoni-moda-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/bodoni-moda@5/files/bodoni-moda-latin-700-normal.woff`, fontWeight: 700 },
    {
      src: `${FS}/bodoni-moda@5/files/bodoni-moda-latin-400-italic.woff`,
      fontWeight: 400,
      fontStyle: 'italic',
    },
  ],
});

Font.register({
  family: 'Italiana',
  fonts: [
    { src: `${FS}/italiana@5/files/italiana-latin-400-normal.woff`, fontWeight: 400 },
  ],
});

Font.register({
  family: 'Crimson Pro',
  fonts: [
    { src: `${FS}/crimson-pro@5/files/crimson-pro-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/crimson-pro@5/files/crimson-pro-latin-500-normal.woff`, fontWeight: 500 },
    {
      src: `${FS}/crimson-pro@5/files/crimson-pro-latin-400-italic.woff`,
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
