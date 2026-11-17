import { Font } from '@react-pdf/renderer';
import bodoniModa400 from '@fontsource/bodoni-moda/files/bodoni-moda-latin-400-normal.woff?url';
import bodoniModa400Italic from '@fontsource/bodoni-moda/files/bodoni-moda-latin-400-italic.woff?url';
import bodoniModa500 from '@fontsource/bodoni-moda/files/bodoni-moda-latin-500-normal.woff?url';
import bodoniModa700 from '@fontsource/bodoni-moda/files/bodoni-moda-latin-700-normal.woff?url';
import cormorant400 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff?url';
import cormorant400Italic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff?url';
import cormorant700 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url';
import crimsonPro400 from '@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff?url';
import crimsonPro400Italic from '@fontsource/crimson-pro/files/crimson-pro-latin-400-italic.woff?url';
import crimsonPro500 from '@fontsource/crimson-pro/files/crimson-pro-latin-500-normal.woff?url';
import ebGaramond400 from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import ebGaramond400Italic from '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url';
import ebGaramond700 from '@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url';
import plexSans400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url';
import plexSans500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff?url';
import plexSans600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url';
import plexSans700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff?url';
import plexSerif500 from '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-500-normal.woff?url';
import plexSerif700 from '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-700-normal.woff?url';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import interTight400 from '@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff?url';
import interTight500 from '@fontsource/inter-tight/files/inter-tight-latin-500-normal.woff?url';
import interTight700 from '@fontsource/inter-tight/files/inter-tight-latin-700-normal.woff?url';
import italiana400 from '@fontsource/italiana/files/italiana-latin-400-normal.woff?url';
import jetbrainsMono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import jetbrainsMono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';
import lora400 from '@fontsource/lora/files/lora-latin-400-normal.woff?url';
import lora400Italic from '@fontsource/lora/files/lora-latin-400-italic.woff?url';
import lora700 from '@fontsource/lora/files/lora-latin-700-normal.woff?url';
import playfair400 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import playfair400Italic from '@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff?url';
import playfair700 from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import sourceSerif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff?url';
import sourceSerif400Italic from '@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff?url';
import sourceSerif700 from '@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff?url';

// ─── Custom font registration ────────────────────────────────────────────────
//
// Real fonts make the difference between "office doc" and "designed magazine."
// The .woff files come from the @fontsource packages and Vite emits them as
// hashed assets on our own origin, so the production CSP's connect-src 'self'
// covers them. Never point a src at a CDN: connect-src blocks it, and a font
// that fails to load fails the whole render, not just that font (MYK9-2102).
// @react-pdf fetches each file once at first render and caches it in memory.

Font.register({
  family: 'Inter',
  fonts: [
    { src: inter400, fontWeight: 400 },
    { src: inter500, fontWeight: 500 },
    { src: inter700, fontWeight: 700 },
  ],
});

Font.register({
  family: 'Playfair Display',
  fonts: [
    { src: playfair400, fontWeight: 400 },
    { src: playfair700, fontWeight: 700 },
    { src: playfair400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'Lora',
  fonts: [
    { src: lora400, fontWeight: 400 },
    { src: lora700, fontWeight: 700 },
    { src: lora400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'Cormorant Garamond',
  fonts: [
    { src: cormorant400, fontWeight: 400 },
    { src: cormorant700, fontWeight: 700 },
    { src: cormorant400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'Inter Tight',
  fonts: [
    { src: interTight400, fontWeight: 400 },
    { src: interTight500, fontWeight: 500 },
    { src: interTight700, fontWeight: 700 },
  ],
});

// Note: Archivo Black and Oswald both use CFF outlines which crash @react-pdf's
// glyph-metrics parser. The Poster style uses Inter Tight 700 (TrueType, already
// registered above) for its display font — condensed and heavy enough for the
// poster aesthetic without the CFF rendering issue.

// IBM Plex Mono (@fontsource v4 and v5) triggers @react-pdf's glyph-metrics
// parser to overflow — RangeError in _getCBox/_getMetrics/advanceWidth —
// on every use of the family, crashing Poster and Field Guide entirely.
// JetBrains Mono has nearly identical proportions and weight and parses
// cleanly. Registered as 'IBM Plex Mono' so Poster eyebrow caps and Field
// Guide §-prefixed rows pick it up transparently — no call-site changes needed.
Font.register({
  family: 'IBM Plex Mono',
  fonts: [
    { src: jetbrainsMono400, fontWeight: 400 },
    { src: jetbrainsMono700, fontWeight: 700 },
  ],
});

// Field Guide style needs IBM Plex Sans + IBM Plex Serif, both of which parse
// cleanly (unlike IBM Plex Mono above). The serif is used in exactly two PDF
// surfaces: the landing-page welcome prose and the entry-blank agreement block.
Font.register({
  family: 'IBM Plex Sans',
  fonts: [
    { src: plexSans400, fontWeight: 400 },
    { src: plexSans500, fontWeight: 500 },
    { src: plexSans600, fontWeight: 600 },
    { src: plexSans700, fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBM Plex Serif',
  fonts: [
    { src: plexSerif500, fontWeight: 500 },
    { src: plexSerif700, fontWeight: 700 },
  ],
});

Font.register({
  family: 'Source Serif 4',
  fonts: [
    { src: sourceSerif400, fontWeight: 400 },
    { src: sourceSerif700, fontWeight: 700 },
    { src: sourceSerif400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'EB Garamond',
  fonts: [
    { src: ebGaramond400, fontWeight: 400 },
    { src: ebGaramond700, fontWeight: 700 },
    { src: ebGaramond400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

// Monogram visual system (Bodoni Moda display + Italiana decorative initials +
// Crimson Pro body) — added when the polished Monogram entry-blank shipped.
Font.register({
  family: 'Bodoni Moda',
  fonts: [
    { src: bodoniModa400, fontWeight: 400 },
    { src: bodoniModa500, fontWeight: 500 },
    { src: bodoniModa700, fontWeight: 700 },
    { src: bodoniModa400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

Font.register({
  family: 'Italiana',
  fonts: [{ src: italiana400, fontWeight: 400 }],
});

Font.register({
  family: 'Crimson Pro',
  fonts: [
    { src: crimsonPro400, fontWeight: 400 },
    { src: crimsonPro500, fontWeight: 500 },
    { src: crimsonPro400Italic, fontWeight: 400, fontStyle: 'italic' },
  ],
});

// Disable the default word-splitter so display text doesn't hyphenate at
// awkward places (e.g., across the centered cover headline). Guarded so
// partial Font mocks in unit tests don't trip on a missing method.
if (typeof Font.registerHyphenationCallback === 'function') {
  Font.registerHyphenationCallback(word => [word]);
}
