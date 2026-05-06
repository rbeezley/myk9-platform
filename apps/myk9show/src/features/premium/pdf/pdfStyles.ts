import { Font, StyleSheet } from '@react-pdf/renderer';
import type { PremiumStyle } from '../../../types/premium-types';

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
  ],
});

// Disable the default word-splitter so display text doesn't hyphenate at
// awkward places (e.g., across the centered cover headline). Guarded so
// partial Font mocks in unit tests don't trip on a missing method.
if (typeof Font.registerHyphenationCallback === 'function') {
  Font.registerHyphenationCallback(word => [word]);
}

// ─── Style tokens ────────────────────────────────────────────────────────────
//
// Three distinct visual identities. Each style picks its own font pair, color
// palette, cover signature, and section-divider treatment so the resulting
// PDFs feel like three different magazines, not three colorways of the same.

export interface StyleTokens {
  // Typography
  displayFont: string;
  bodyFont: string;
  boldWeight: 700;
  // Palette
  accentColor: string;
  secondaryColor: string;
  surfaceColor: string;
  textColor: string;
  // Layout
  pagePadding: number;
  bodyFontSize: number;
  // Cover signature: drives <HeroCover> branching
  coverStyle: 'centered' | 'topblock' | 'lowerthird';
}

export const STYLE_TOKENS: Record<PremiumStyle, StyleTokens> = {
  classic: {
    displayFont: 'Playfair Display',
    bodyFont: 'Lora',
    boldWeight: 700,
    accentColor: '#0a2342', // Deep navy
    secondaryColor: '#b08d57', // Antique gold
    surfaceColor: '#f7f3ec', // Ivory
    textColor: '#1a1a1a',
    pagePadding: 56,
    bodyFontSize: 11,
    coverStyle: 'centered',
  },
  modern: {
    displayFont: 'Inter',
    bodyFont: 'Inter',
    boldWeight: 700,
    accentColor: '#0f172a', // Charcoal
    secondaryColor: '#ee5a3a', // Coral pop
    surfaceColor: '#fafafa',
    textColor: '#1a1a1a',
    pagePadding: 44,
    bodyFontSize: 10,
    coverStyle: 'topblock',
  },
  minimal: {
    displayFont: 'Cormorant Garamond',
    bodyFont: 'Inter',
    boldWeight: 700,
    accentColor: '#0a0a0a',
    secondaryColor: '#737373',
    surfaceColor: '#fdfcf9',
    textColor: '#1a1a1a',
    pagePadding: 72,
    bodyFontSize: 9,
    coverStyle: 'lowerthird',
  },
};

export function buildStyles(style: PremiumStyle) {
  const t = STYLE_TOKENS[style];
  return StyleSheet.create({
    page: {
      fontFamily: t.bodyFont,
      fontSize: t.bodyFontSize,
      padding: t.pagePadding,
      color: t.textColor,
      backgroundColor: '#ffffff',
    },

    // ─── Cover ─────────────────────────────────────────────────────────────
    coverPage: {
      fontFamily: t.bodyFont,
      fontSize: t.bodyFontSize,
      color: t.textColor,
      backgroundColor: t.surfaceColor,
      padding: 0,
    },
    coverFill: { flex: 1 },
    coverColorBand: {
      backgroundColor: t.accentColor,
      paddingHorizontal: t.pagePadding,
      paddingVertical: 56,
    },
    coverColorBandText: { color: t.surfaceColor },

    // ─── Header ────────────────────────────────────────────────────────────
    header: { alignItems: 'center', marginBottom: 16 },
    clubName: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 16,
      color: t.accentColor,
      textAlign: 'center',
    },
    showName: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 13,
      color: t.accentColor,
      textAlign: 'center',
      marginTop: 4,
    },
    subheader: { textAlign: 'center', marginTop: 2 },

    // ─── Section structure ─────────────────────────────────────────────────
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: t.accentColor,
      marginVertical: 16,
    },
    sectionTitle: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      fontSize: 9,
      color: t.accentColor,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 8,
      marginTop: 4,
    },

    // ─── Rows / labels ─────────────────────────────────────────────────────
    row: { flexDirection: 'row', marginBottom: 4 },
    label: {
      fontFamily: t.bodyFont,
      fontWeight: 700,
      width: 110,
      color: t.textColor,
    },
    value: { flex: 1 },
    required: { color: '#cc0000' },
    body: { marginBottom: 4 },

    // ─── Pull-quote / display data ─────────────────────────────────────────
    pullQuoteRow: { flexDirection: 'row', gap: 24, marginVertical: 12 },
    pullQuoteCell: { flex: 1 },
    pullQuoteValue: {
      fontFamily: t.displayFont,
      fontSize: 28,
      color: t.accentColor,
      lineHeight: 1.1,
    },
    pullQuoteLabel: {
      fontFamily: t.bodyFont,
      fontSize: 7,
      color: t.secondaryColor,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginTop: 4,
    },

    // ─── Trial blocks ──────────────────────────────────────────────────────
    trialBlock: {
      marginBottom: 12,
      paddingLeft: 0,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: t.secondaryColor,
    },
    trialTitle: {
      fontFamily: t.displayFont,
      fontSize: 14,
      color: t.accentColor,
      marginBottom: 4,
    },
    indent: { paddingLeft: 12 },
    boilerplate: { fontSize: 9, color: '#444444', marginBottom: 4 },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatDate(d: string) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  // Format in UTC so DATE-only columns (e.g., '2026-06-13', which JS parses as
  // midnight UTC) don't roll backward a day in negative-offset timezones.
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Build a typographic monogram from a club name. Strips honorifics + trailing
// numerals + corporate suffixes, then takes the first letter of each remaining
// word. Capped at 3 letters because anything longer reads as an acronym, not a
// monogram. Falls back to the first non-empty character if no clean letters
// can be extracted.
// Keep brand-defining words like "Club", "Kennel", "Association" — for dog
// clubs they're part of the identity, not filler. Only strip articles + legal
// suffixes that almost never belong in a monogram.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  '&',
  'inc',
  'inc.',
  'llc',
  'llc.',
  'company',
  'co',
  'co.',
]);

export function buildMonogram(name: string | null | undefined): string {
  if (!name) return '';
  const words = name
    .replace(/[^A-Za-z &]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0 && !STOPWORDS.has(w.toLowerCase()));
  if (words.length === 0) {
    const fallback = (name.match(/[A-Za-z]/) ?? [''])[0];
    return fallback.toUpperCase();
  }
  return words
    .slice(0, 3)
    .map(w => w[0]!.toUpperCase())
    .join('');
}

// Format common US phone shapes; pass through anything else unchanged so we
// don't mangle international numbers or pre-formatted input.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}
