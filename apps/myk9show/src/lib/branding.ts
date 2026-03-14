import type { CSSProperties } from 'react';

export interface ShowBranding {
  logo: string | null;
  coverImage: string | null;
  accentColor: string | null;
}

export interface BrandPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryMuted: string;
  onPrimary: string;
}

export interface PresetColor {
  name: string;
  hex: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Cyan', hex: '#0891b2' },
  { name: 'Gold', hex: '#ca8a04' },
  { name: 'Pink', hex: '#be185d' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Emerald', hex: '#059669' },
];

interface ShowBrandingInput {
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  accentColor?: string | null;
}

interface ClubBrandingInput {
  logo?: string | null;
  coverImage?: string | null;
  accentColor?: string | null;
}

export function resolveShowBranding(
  show: ShowBrandingInput,
  club: ClubBrandingInput
): ShowBranding {
  return {
    logo: show.logoUrl || club.logo || null,
    coverImage: show.coverImageUrl || club.coverImage || null,
    accentColor: show.accentColor || club.accentColor || null,
  };
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const hue2rgb = (p: number, q: number, t: number): number => {
    const tNorm = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };
  if (s === 0) {
    const val = Math.round(l * 255);
    return `#${val.toString(16).padStart(2, '0').repeat(3)}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function generatePalette(hex: string): BrandPalette {
  const [h, s, l] = hexToHsl(hex);
  const [r, g, b] = hexToRgb(hex);
  const lum = relativeLuminance(r, g, b);
  const onPrimary = lum > 0.179 ? '#1a1a2e' : '#ffffff';
  return {
    primary: hex,
    primaryLight: hslToHex(h, s, Math.min(1, l + 0.15)),
    primaryDark: hslToHex(h, s, Math.max(0, l - 0.15)),
    primaryMuted: `rgba(${r}, ${g}, ${b}, 0.2)`,
    onPrimary,
  };
}

/** Returns a `borderLeft` style object for accent color, or undefined if no color. */
export function accentBorderStyle(accentColor?: string | null): CSSProperties | undefined {
  return accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined;
}
