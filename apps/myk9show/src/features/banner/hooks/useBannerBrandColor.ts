/**
 * useBannerBrandColor — resolves per-club Banner flag color into a
 * 4-value bundle the masthead, final-CTA band, and primary buttons need.
 *
 * Banner is the first premium style with a per-club configurable accent
 * color. The DB stores a single hex (`shows.brand_color`); this hook
 * derives the deep / bright siblings via OKLCH lightness math at runtime,
 * and picks ink vs paper for text-on-flag using WCAG relative luminance.
 *
 * Why JS-side and not pure CSS:
 * - The web side could use `color-mix(in oklch, …)` and `var(--bn-flag)`
 *   directly, but the email template can't (Outlook strips both). To keep
 *   the web and email surfaces visually identical for a given club, the
 *   same derivation runs in JS in both contexts. The Deno edge function
 *   duplicates this logic in `banner-email.ts`.
 * - Same reason we precompute `textOnFlag` here: CSS `color-contrast()`
 *   is browser-only and email needs the value baked in.
 */

import { useMemo } from 'react';
import { bannerColors } from '../tokens';

export interface BannerBrandColors {
  /** The flag color from the show row, validated and normalized. */
  flag: string;
  /** Deeper sibling for hover states / dark surfaces. */
  flagDeep: string;
  /** Brighter sibling for the "in confidence" emphasis on the final band. */
  flagBright: string;
  /** Ink or paper, chosen by relative-luminance threshold. */
  textOnFlag: '#ffffff' | '#111111';
}

interface BannerColorInput {
  brand_color?: string | null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function useBannerBrandColor(show: BannerColorInput | null | undefined): BannerBrandColors {
  return useMemo(() => deriveBannerBrandColors(show?.brand_color), [show?.brand_color]);
}

/** Pure derivation — exported so `banner-email.ts` and unit tests can call
 *  it without setting up a React tree. */
export function deriveBannerBrandColors(
  input: string | null | undefined
): BannerBrandColors {
  const flag = HEX_RE.test(input ?? '') ? (input as string) : bannerColors.flag;
  const { r, g, b } = hexToRgb(flag);
  return {
    flag,
    flagDeep: shiftLightness(flag, -0.45),
    flagBright: shiftLightness(flag, 0.35),
    textOnFlag: relativeLuminance(r, g, b) > 0.5 ? '#111111' : '#ffffff',
  };
}

/** Mix toward white when delta > 0, toward black when delta < 0. Bounded
 *  shift in linear RGB — close enough to OKLCH for our two siblings and
 *  works in both JS and Deno without a color library. */
function shiftLightness(hex: string, delta: number): string {
  const { r, g, b } = hexToRgb(hex);
  const target = delta >= 0 ? 255 : 0;
  const amount = Math.min(1, Math.abs(delta));
  const mix = (c: number) => Math.round(c + (target - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** WCAG relative luminance, normalized 0–1. */
function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
