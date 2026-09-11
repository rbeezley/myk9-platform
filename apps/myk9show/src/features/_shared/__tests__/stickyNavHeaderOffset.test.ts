import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * No landing's sticky sub-nav may pin itself to the viewport top.
 *
 * The app header is `position: fixed` and 48px tall, so a sticky sub-nav at
 * `top: 0` scrolls underneath it and loses its top 48px. On the show premium
 * that cut the "Enter this show" button in half — the primary call to action,
 * on the page whose whole job is to get an entry. Every one of the landings
 * shipped it, because each set its own offset rather than reading the shared
 * `--app-top-inset` token that exists for this (index.css, "App top-chrome
 * offsets").
 *
 * WHAT THIS CAN AND CANNOT PROVE. It is a source scan, not a geometry
 * assertion, because jsdom performs no layout and does not apply the Tailwind
 * or plain-CSS rules these elements rely on — there is no rendered `top` to
 * measure in a unit test. So it cannot prove the nav is positioned correctly.
 * It asserts the ABSENCE of the one value known to be wrong, which is a
 * narrower claim than "this works" and is worth having only because the
 * failure is invisible until someone scrolls a real browser. The positive
 * proof is the browser measurement recorded in PR #2178.
 */

const FEATURES = resolve(__dirname, '../..');
const STYLES = resolve(__dirname, '../../../styles');

/** `position: sticky` paired with a zero top, in CSS or inline-style form. */
const CSS_STICKY_AT_ZERO =
  /position:\s*['"]?sticky['"]?[;,]?\s*(?:\/\*[^*]*\*\/\s*)*top:\s*['"]?0(?:px|rem)?['"]?\s*[;,]/;
/** Tailwind's `sticky top-0`, in either order. */
const TW_STICKY_AT_ZERO = /(?:\bsticky\b[^"'`]*\btop-0\b|\btop-0\b[^"'`]*\bsticky\b)/;

function filesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, exts));
    else if (exts.some(ext => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

const CANDIDATES = [
  ...filesUnder(FEATURES, ['.tsx', '.css']),
  ...filesUnder(STYLES, ['.css']),
].filter(path => /landing|StickyNav|TopStrip|headline\.css|landing\.css/i.test(path));

describe('landing sticky navs clear the fixed app header', () => {
  it('finds landing files to scan (guards against a broken glob)', () => {
    expect(CANDIDATES.length).toBeGreaterThan(5);
  });

  it('pins no sticky landing nav to the viewport top', () => {
    const offenders = CANDIDATES.filter(path => {
      const source = readFileSync(path, 'utf8');
      return CSS_STICKY_AT_ZERO.test(source) || TW_STICKY_AT_ZERO.test(source);
    }).map(path => path.slice(path.indexOf('/src/') + 1));

    expect(offenders).toEqual([]);
  });

  it('detects both spellings, so the scan cannot silently pass', () => {
    // Positive controls: without these the test above could be vacuous.
    expect(CSS_STICKY_AT_ZERO.test("position: 'sticky',\n        top: 0,")).toBe(true);
    expect(CSS_STICKY_AT_ZERO.test('position: sticky;\n  top: 0;')).toBe(true);
    expect(TW_STICKY_AT_ZERO.test('className="sticky top-0 z-50"')).toBe(true);
    expect(TW_STICKY_AT_ZERO.test('className="top-0 sticky"')).toBe(true);
    // And does not fire on the corrected forms.
    expect(
      CSS_STICKY_AT_ZERO.test("position: 'sticky',\n        top: 'var(--app-top-inset, 3rem)',")
    ).toBe(false);
    expect(TW_STICKY_AT_ZERO.test('className="sticky top-[var(--app-top-inset,3rem)]"')).toBe(
      false
    );
  });
});
