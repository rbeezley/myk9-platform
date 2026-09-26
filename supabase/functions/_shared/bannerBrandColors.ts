// supabase/functions/_shared/bannerBrandColors.ts
//
// Banner per-club colour derivation — the ONE copy. The web app re-exports it
// from apps/myk9show/src/features/banner/hooks/useBannerBrandColor.ts and the
// confirmation email imports it directly, so a club's flag reads identically
// on the page and in the inbox. Pure: no imports, no Deno or DOM APIs.
//
// The DB stores a single hex (`shows.brand_color`, any 6-digit value). Every
// TEXT colour derived here is guaranteed WCAG AA (4.5:1) on the surface it is
// painted on, whatever the club picked (MYK9-765): a light flag such as
// yellow #f5c211 is 1.59:1 on paper, so the flag itself cannot be text.

export const BANNER_DEFAULT_FLAG = '#0d4d4f';
/** Page background. */
export const BANNER_PAPER = '#fafaf8';
/** Alt-section background (Roster) — the darker of the two paper surfaces. */
export const BANNER_PAPER_WARM = '#f0eeea';

/** The faintest paper text the final band paints: secondary copy at 70%
 *  opacity (the email's member-club line; the page's note uses 85%). The
 *  band guarantee is measured at this opacity, so full-strength and 85%
 *  paper pass with room to spare. */
export const BANNER_BAND_MUTED_OPACITY = 0.7;

/** WCAG AA for body text. */
const AA = 4.5;
/** HSL lightness step: small enough that "minimal" overshoots by < 0.3:1. */
const STEP = 0.005;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export interface BannerBrandColors {
  /** The flag color from the show row, validated and normalized. */
  flag: string;
  /** The flag as TEXT on paper: the flag itself when it already reaches
   *  4.5:1 on both paper surfaces, otherwise the same hue darkened only as
   *  far as it takes. Use for every flag-coloured text on paper; `flag`
   *  stays for fills, rules and borders. */
  flagText: string;
  /** Deeper sibling — the final band's surface. Darkened further when needed
   *  so paper text on it reaches 4.5:1 even at `BANNER_BAND_MUTED_OPACITY`. */
  flagDeep: string;
  /** Brighter sibling — decorative (gradients, focus ring). Not text-safe. */
  flagBright: string;
  /** `flagBright` lightened until it reaches 4.5:1 on `flagDeep`: the final
   *  band's "in confidence" accent text. */
  flagBrightOnDeep: string;
  /** Ink or white, whichever contrasts more with the flag. */
  textOnFlag: '#ffffff' | '#111111';
}

export function deriveBannerBrandColors(input: string | null | undefined): BannerBrandColors {
  const flag = HEX_RE.test(input ?? '') ? (input as string) : BANNER_DEFAULT_FLAG;
  const flagDeep = adjustUntil(
    mix(flag, 0, 0.45),
    -1,
    c => contrast(blend(BANNER_PAPER, BANNER_BAND_MUTED_OPACITY, c), c) >= AA
  );
  const flagBright = mix(flag, 255, 0.35);
  return {
    flag,
    flagText: adjustUntil(flag, -1, c => contrast(c, BANNER_PAPER_WARM) >= AA),
    flagDeep,
    flagBright,
    flagBrightOnDeep: adjustUntil(flagBright, +1, c => contrast(c, flagDeep) >= AA),
    textOnFlag: contrast('#111111', flag) >= contrast('#ffffff', flag) ? '#111111' : '#ffffff',
  };
}

/** WCAG 2.x contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Return `hex` unchanged when it already passes; otherwise step its HSL
 *  lightness (keeping hue and saturation) in `direction` until it does. Black
 *  and white bound the walk, and both pass every check used above. */
function adjustUntil(hex: string, direction: 1 | -1, passes: (c: string) => boolean): string {
  if (passes(hex)) return hex;
  const { h, s, l } = toHsl(hex);
  for (let next = l + direction * STEP; next > 0 && next < 1; next += direction * STEP) {
    const candidate = fromHsl(h, s, next);
    if (passes(candidate)) return candidate;
  }
  return direction < 0 ? '#000000' : '#ffffff';
}

/** Linear-RGB mix of `hex` toward black (0) or white (255) by `amount`. */
function mix(hex: string, target: 0 | 255, amount: number): string {
  const [r, g, b] = channels(hex).map(c => Math.round(c + (target - c) * amount));
  return toHex(r, g, b);
}

/** `fg` painted at `alpha` opacity over `bg`. */
function blend(fg: string, alpha: number, bg: string): string {
  const back = channels(bg);
  const [r, g, b] = channels(fg).map((c, i) => Math.round(c * alpha + back[i] * (1 - alpha)));
  return toHex(r, g, b);
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = channels(hex).map(c => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to255 = (v: number) => Math.min(255, Math.max(0, Math.round((v + m) * 255)));
  return toHex(to255(r), to255(g), to255(b));
}
