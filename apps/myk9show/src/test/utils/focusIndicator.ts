/**
 * Focus-indicator visibility analysis (MYK9-95).
 *
 * Extracted from `src/test/e2e/slice5-a11y-keyboard.spec.ts` so it can be unit
 * tested directly. It lives outside `src/test/e2e/` deliberately: vitest
 * excludes `**\/e2e\/**`, so a spec next to the Playwright walk would never run.
 *
 * The job: given computed styles for one element, reduce them to ONLY what a
 * sighted user can actually SEE as a focus ring. The keyboard walk then
 * compares the focused signature against the unfocused one; a control whose
 * signature does not change draws no focus indicator.
 *
 * Everything invisible must reduce to nothing, because the browser reports
 * plenty of styling that paints no pixels:
 *
 *  - Tailwind's `outline-none` does not remove the outline, it sets
 *    `outline: 2px solid transparent` (so Windows forced-colors mode keeps a
 *    ring). Chromium therefore reports a 2px outline on focus and none when
 *    blurred for a control with NO focus styling at all.
 *  - Tailwind's ring machinery emits fully transparent placeholder shadow
 *    layers such as `rgba(0, 0, 0, 0) 0px 0px 0px 0px`.
 *
 * Both must be treated as "nothing drawn", or the walk passes on controls
 * whose focus ring has been deleted.
 */

/** One scope's computed styles, keyed `<depth>|<pseudo>|<property>`. */
export type StyleReading = Record<string, string>;

/**
 * Splits on top-level commas only — colour functions carry their own commas,
 * so a naive `split(',')` shreds `rgba(0, 0, 0, 0)` into four fragments.
 */
export function splitTopLevel(value: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map(p => p.trim()).filter(p => p !== '');
}

/**
 * Extracts the leading colour of a box-shadow layer.
 *
 * A space-separated split CANNOT work here: Chromium serialises shadows as
 * `rgba(0, 0, 0, 0) 0px 0px 0px 0px`, so taking the first space-delimited
 * token yields `rgba(0,` — the alpha never gets looked at, and a fully
 * transparent placeholder layer is treated as a visible ring. That is the
 * vacuous-pass bug this function exists to prevent.
 *
 * Returns the colour and the remaining (geometry) text.
 */
export function parseLeadingColor(layer: string): { color: string; rest: string } {
  const trimmed = layer.trim();

  // Functional notation: rgb(), rgba(), hsl(), oklch(), color(), … Scan to the
  // matching close paren rather than to the next space.
  const fnMatch = /^[a-zA-Z][a-zA-Z0-9-]*\(/.exec(trimmed);
  if (fnMatch) {
    let depth = 0;
    for (let i = fnMatch[0].length - 1; i < trimmed.length; i += 1) {
      if (trimmed[i] === '(') depth += 1;
      if (trimmed[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          return { color: trimmed.slice(0, i + 1), rest: trimmed.slice(i + 1).trim() };
        }
      }
    }
    // Unbalanced parens — treat the whole thing as the colour.
    return { color: trimmed, rest: '' };
  }

  // Keyword or hex colour: first whitespace-delimited token.
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx === -1) return { color: trimmed, rest: '' };
  return { color: trimmed.slice(0, spaceIdx), rest: trimmed.slice(spaceIdx).trim() };
}

/** Parses an alpha component, which may be a number (`0.5`) or a percentage (`50%`). */
function parseAlpha(raw: string): number | null {
  const token = raw.trim();
  if (token === '') return null;
  if (token.endsWith('%')) {
    const pct = Number.parseFloat(token.slice(0, -1));
    return Number.isNaN(pct) ? null : pct / 100;
  }
  const num = Number.parseFloat(token);
  return Number.isNaN(num) ? null : num;
}

/**
 * True only when the colour paints nothing.
 *
 * Note what this must NOT do: match a trailing `, 0)` by pattern. An opaque
 * `rgb(0, 0, 0)` — plain black, the most ordinary focus-ring colour there is —
 * ends in `, 0)` because its BLUE channel is zero. Reading that as a zero alpha
 * discards a real, visible black ring and fails the walk on a compliant
 * control. Alpha is only present in specific positions, so it is located
 * structurally.
 */
export function isTransparentColor(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (value === '') return true;
  if (value === 'transparent') return true;

  // 4- and 8-digit hex carry alpha in the final 1 or 2 digits.
  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 4) return digits[3] === '0';
    if (digits.length === 8) return digits.slice(6) === '00';
    return false; // #rgb / #rrggbb are always opaque
  }

  const fn = /^([a-z][a-z0-9-]*)\((.*)\)$/s.exec(value);
  if (!fn) return false; // named colour (red, black, …) — opaque

  const inner = fn[2];

  // CSS Color 4 slash syntax: rgb(0 0 0 / 0), color(srgb 0 0 0 / 0), oklch(… / 0)
  const slashParts = splitTopLevel(inner, '/');
  if (slashParts.length > 1) {
    const alpha = parseAlpha(slashParts[slashParts.length - 1]);
    return alpha !== null && alpha <= 0;
  }

  // Legacy comma syntax: alpha is the 4th component of rgba()/hsla() only.
  const commaParts = splitTopLevel(inner, ',');
  if (commaParts.length === 4) {
    const alpha = parseAlpha(commaParts[3]);
    return alpha !== null && alpha <= 0;
  }

  // Three components (or a `color()` with no slash) means no alpha channel:
  // fully opaque, however many zeros the channels happen to contain.
  return false;
}

/** True when every length token in the value is zero (`0px`, `0`, `0em`, …). */
export function isAllZeroLength(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(t => {
    const num = Number.parseFloat(t);
    return !Number.isNaN(num) && num === 0;
  });
}

/** True when at least one length token is non-zero. */
export function hasNonZeroLength(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.some(t => {
    const num = Number.parseFloat(t);
    return !Number.isNaN(num) && num !== 0;
  });
}

/**
 * Keeps only the box-shadow layers that paint something: a layer is dropped if
 * its colour is transparent OR its geometry is entirely zero (no offset, no
 * blur, no spread draws nothing regardless of colour).
 */
export function visibleShadowLayers(boxShadow: string): string[] {
  const value = boxShadow.trim();
  if (value === '' || value === 'none') return [];

  return splitTopLevel(value, ',').filter(layer => {
    const { color, rest } = parseLeadingColor(layer);
    if (isTransparentColor(color)) return false;
    const geometry = rest.replace(/\binset\b/gi, '').trim();
    if (geometry === '') return true; // no geometry reported — assume it paints
    return !isAllZeroLength(geometry);
  });
}

/** Every scope (`<depth>|<pseudo>`) present in a reading. */
export function scopePrefixes(reading: StyleReading): string[] {
  return Array.from(new Set(Object.keys(reading).map(k => k.split('|').slice(0, 2).join('|'))));
}

/**
 * Reduces one scope's raw computed styles to a signature of what is visibly
 * drawn. An empty string means "nothing a user could see".
 */
export function ringSignature(reading: StyleReading, prefix: string): string {
  const get = (prop: string) => reading[`${prefix}|${prop}`] ?? '';
  const parts: string[] = [];

  const outlineVisible =
    get('outlineStyle') !== 'none' &&
    get('outlineStyle') !== '' &&
    hasNonZeroLength(get('outlineWidth')) &&
    !isTransparentColor(get('outlineColor'));
  if (outlineVisible) {
    parts.push(
      `outline:${get('outlineStyle')}/${get('outlineWidth')}/${get('outlineColor')}/${get('outlineOffset')}`
    );
  }

  const shadows = visibleShadowLayers(get('boxShadow'));
  if (shadows.length > 0) parts.push(`shadow:${shadows.join(' | ')}`);

  const underline = get('textDecorationLine');
  if (underline && underline !== 'none') parts.push(`underline:${underline}`);

  // Border colour can be a multi-value list ("rgb(1,2,3) rgb(4,5,6)"), so
  // check whether ANY side contributes a visible edge.
  const borderColors = get('borderColor').trim();
  const anyOpaqueBorderColor =
    borderColors !== '' &&
    splitTopLevel(borderColors, ' ').some(c => !isTransparentColor(c)) === true;
  if (hasNonZeroLength(get('borderWidth')) && anyOpaqueBorderColor) {
    parts.push(`border:${get('borderWidth')}/${borderColors}`);
  }

  const content = get('content');
  if (content && content !== 'none' && content !== 'normal') parts.push(`content:${content}`);

  return parts.join(' ; ');
}
