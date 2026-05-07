import type { PremiumStyle } from '../../../types/premium-types';

// ─── Style tokens ────────────────────────────────────────────────────────────
//
// Each style picks its own font pair, color palette, cover signature, and
// section-divider treatment so the resulting PDFs feel like distinct
// magazines, not colorways of the same template.

export interface StyleTokens {
  // Typography
  displayFont: string;
  bodyFont: string;
  // Optional monospace face for utility/reference layouts (e.g., Field Guide
  // eyebrows, §-numbers, stat labels). Styles that don't need a mono leave it
  // undefined; consumers fall back to a literal at the call site.
  monoFont?: string;
  boldWeight: 700;
  // Palette
  accentColor: string;
  secondaryColor: string;
  surfaceColor: string;
  textColor: string;
  // Optional accent for styles that need a deep secondary accent (e.g.,
  // Heritage's oxblood for ornamental detail). Only set on styles that use it.
  accentDeep?: string;
  // Layout
  pagePadding: number;
  bodyFontSize: number;
  // Cover signature: drives <HeroCover> branching. The new branches
  // ('editorial' | 'poster' | 'masthead' | 'fieldindex' | 'engraved') are
  // declared now but not yet rendered — Phase 2 implements them.
  coverStyle:
    | 'centered'
    | 'topblock'
    | 'lowerthird'
    | 'editorial'
    | 'poster'
    | 'masthead'
    | 'fieldindex'
    | 'engraved';
  // Body layout: drives template body branching. Phase 1 only emits 'standard';
  // future phases switch to the alternative layouts.
  bodyLayout: 'standard' | 'poster' | 'gazette' | 'fieldguide';
}

// Token bundle for monogram — preserved verbatim so the rename is visually
// byte-identical to the prior 'classic' style.
export const MONOGRAM_TOKENS: StyleTokens = {
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
  bodyLayout: 'standard',
};

export const STYLE_TOKENS: Record<PremiumStyle, StyleTokens> = {
  monogram: MONOGRAM_TOKENS,
  banner: {
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
    bodyLayout: 'standard',
  },
  headline: {
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
    bodyLayout: 'standard',
  },
  magazine: {
    displayFont: 'Cormorant Garamond',
    bodyFont: 'Source Serif 4',
    boldWeight: 700,
    accentColor: '#4a3826', // Deep warm umber (gradient terminus)
    secondaryColor: '#c9a87c', // Warm gold (gradient origin)
    surfaceColor: '#fbf8f1', // Warm cream
    textColor: '#1a1a1a',
    pagePadding: 56,
    bodyFontSize: 11,
    coverStyle: 'editorial',
    bodyLayout: 'standard',
  },
  poster: {
    // Archivo Black, Oswald, and Inter Tight all use CFF outlines which crash
    // @react-pdf's glyph-metrics parser. Falling back to Inter 700 — proven
    // to render reliably (used by Banner, Headline, Field Guide). The poster
    // aesthetic is preserved via large fontSize + uppercase + tight tracking
    // in PosterCover/PosterBody.
    displayFont: 'Inter',
    bodyFont: 'Inter',
    boldWeight: 700,
    accentColor: '#c83b1a', // Red
    secondaryColor: '#1f1d18', // Dark olive
    surfaceColor: '#f3ede0', // Cream
    textColor: '#1f1d18',
    pagePadding: 56,
    bodyFontSize: 11,
    coverStyle: 'poster',
    bodyLayout: 'poster',
  },
  gazette: {
    displayFont: 'Playfair Display',
    bodyFont: 'Source Serif 4',
    boldWeight: 700,
    accentColor: '#6b4f3a', // Sepia
    secondaryColor: '#2a2520', // Newsprint ink
    surfaceColor: '#f7f1e3', // Ivory newsprint
    textColor: '#2a2520',
    pagePadding: 56,
    bodyFontSize: 10,
    coverStyle: 'masthead',
    bodyLayout: 'gazette',
  },
  fieldGuide: {
    // IBM Plex Sans is not registered in pdfFonts; fall back to Inter for the
    // utility-reference sans look.
    displayFont: 'Inter',
    bodyFont: 'Inter',
    monoFont: 'IBM Plex Mono',
    boldWeight: 700,
    accentColor: '#c96442', // Indicator orange
    secondaryColor: '#1f2a24', // Dark ink
    surfaceColor: '#f6f1e6', // Parchment
    textColor: '#1f2a24',
    pagePadding: 48,
    bodyFontSize: 9,
    coverStyle: 'fieldindex',
    bodyLayout: 'fieldguide',
  },
  heritage: {
    displayFont: 'Cormorant Garamond',
    bodyFont: 'EB Garamond',
    boldWeight: 700,
    accentColor: '#29200f', // Ink
    secondaryColor: '#b08948', // Gold
    surfaceColor: '#f4ecd8', // Ivory
    textColor: '#29200f',
    accentDeep: '#7a1f1f', // Oxblood
    pagePadding: 64,
    bodyFontSize: 11,
    coverStyle: 'engraved',
    bodyLayout: 'standard',
  },
};

// Org parity matrix. Default: each style supports both AKC and UKC. Narrow
// later if a specific style needs gating to one org's conventions.
export type OrgKey = 'AKC' | 'UKC';
export const STYLE_ORG_SUPPORT: Record<PremiumStyle, OrgKey[]> = {
  monogram: ['AKC', 'UKC'],
  banner: ['AKC', 'UKC'],
  headline: ['AKC', 'UKC'],
  magazine: ['AKC', 'UKC'],
  poster: ['AKC', 'UKC'],
  gazette: ['AKC', 'UKC'],
  fieldGuide: ['AKC', 'UKC'],
  heritage: ['AKC', 'UKC'],
};

export interface ResolveTokensOptions {
  inkSaver?: boolean;
}

// High-contrast B&W palette swapped in when ink-saver is requested. Layout
// and typography stay intact — only the color triplet collapses.
export const INK_SAVER_PALETTE = {
  surfaceColor: '#ffffff',
  accentColor: '#000000',
  secondaryColor: '#1a1a1a',
} as const;

// Legacy style names from before migration 191. If the DB hasn't been migrated
// yet (or the edge function returns a stale value), map them forward so the
// renderer never receives an unknown key.
const LEGACY_STYLE_MAP: Record<string, PremiumStyle> = {
  classic: 'monogram',
  modern: 'banner',
  minimal: 'headline',
};

/**
 * Resolve final tokens for a style, optionally with an ink-saver palette.
 * Ink saver collapses the palette to black/white/near-black so home printers
 * can run a draft without burning toner. Layout/typography unchanged.
 *
 * Defensively remaps pre-migration-191 style names ('classic', 'modern',
 * 'minimal') to their canonical equivalents so the renderer never crashes
 * on a stale DB value.
 */
export function resolveTokens(style: PremiumStyle, opts?: ResolveTokensOptions): StyleTokens {
  const canonical = LEGACY_STYLE_MAP[style as string] ?? style;
  const base = STYLE_TOKENS[canonical] ?? MONOGRAM_TOKENS;
  if (!opts?.inkSaver) return base;
  return { ...base, ...INK_SAVER_PALETTE };
}

export interface BuildStylesOptions {
  inkSaver?: boolean;
}

// Roman numeral helper for cover folios. Only supports 1–10 today; falls back
// to a decimal string for anything outside the lookup table.
const ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function numberToRoman(n: number): string {
  return ROMAN_NUMERALS[n] ?? String(n);
}
