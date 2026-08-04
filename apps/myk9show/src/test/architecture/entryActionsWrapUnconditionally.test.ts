/**
 * The My Shows entry-card action rows must wrap at EVERY width, not only below
 * a breakpoint.
 *
 * MYK9-124 / EUX-2026-07-30-04: `.myk9-entries-action-buttons` was
 * `display:flex` with no `flex-wrap`, and gained `flex-wrap: wrap` only inside
 * `@media (max-width: 768px)`. Every button carries `whitespace-nowrap` from
 * `buttonVariants`, and the expanded card renders up to five of them ("View
 * Show", "Edit Entry", "View run order", "Message the show team", "Receipt"),
 * so the row needs ~770px. `.myk9-entries-card` is `overflow:hidden`, so once
 * the row did not fit it was CLIPPED rather than scrolled — no scrollbar, no
 * ellipsis, no hint that an action existed.
 *
 * Browser zoom is what exposed it. Zooming shrinks the CSS-pixel viewport
 * (1440px at 125% = 1152 CSS px), so 125%–150% landed in a band that was too
 * narrow for the row but still wider than 768px. 200% crossed back into the
 * mobile block and looked correct again, which is why the report reads "clips
 * at about 125%" rather than "clips when narrow".
 *
 * A breakpoint can never cover this: zoom is continuous, breakpoints are
 * discrete. The fix is that wrapping is unconditional, and this guard exists so
 * a future tidy-up cannot quietly move it back inside a media query — a change
 * that would look harmless in review and would only resurface under zoom.
 *
 * Real-browser geometry proof at 125/150/200% lives in
 * `src/test/e2e/myEntriesZoomReflow.spec.ts`. This test is the cheap guard that
 * runs on every PR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS_PATH = join(__dirname, '../../styles/myk9-show-details.css');

/** Selectors whose base rule must declare wrapping. */
const MUST_WRAP = ['.myk9-entries-action-buttons', '.myk9-entries-actions'];

/** Strip `/* … *\/` comments. Must run before any `@` or brace scanning: prose
 * inside a comment can mention `@media` or carry unbalanced braces, and would
 * otherwise be parsed as real syntax. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Remove every at-rule block (`@media`, `@supports`, `@container`) so what
 * remains is only the unconditional cascade. Brace-matched rather than
 * regex-matched, because these blocks nest.
 */
function stripAtRuleBlocks(source: string): string {
  const css = stripComments(source);
  let out = '';
  let index = 0;

  while (index < css.length) {
    const at = css.indexOf('@', index);
    if (at === -1) {
      out += css.slice(index);
      break;
    }

    const open = css.indexOf('{', at);
    if (open === -1) {
      out += css.slice(index);
      break;
    }

    // At-rules without a block (@import, @charset) end at the semicolon.
    const semicolon = css.indexOf(';', at);
    if (semicolon !== -1 && semicolon < open) {
      out += css.slice(index, semicolon + 1);
      index = semicolon + 1;
      continue;
    }

    out += css.slice(index, at);

    let depth = 0;
    let cursor = open;
    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }

  return out;
}

/** Body of the last base rule whose selector list contains `selector`. */
function baseRuleBody(css: string, selector: string): string | null {
  const unconditional = stripAtRuleBlocks(css);
  const pattern = new RegExp(`(^|[},])([^{}]*\\${selector}\\s*(?:,[^{}]*)?)\\{([^{}]*)\\}`, 'g');

  let body: string | null = null;
  for (const match of unconditional.matchAll(pattern)) {
    const selectorList = match[2];
    // Guard against matching `.myk9-entries-actions` inside
    // `.myk9-entries-action-buttons`: require a real selector boundary.
    const boundary = new RegExp(`\\${selector}(?![\\w-])`);
    if (boundary.test(selectorList)) body = match[3];
  }
  return body;
}

describe('My Shows entry actions wrap unconditionally (MYK9-124)', () => {
  const css = readFileSync(CSS_PATH, 'utf8');

  for (const selector of MUST_WRAP) {
    it(`${selector} declares flex-wrap: wrap outside any media query`, () => {
      const body = baseRuleBody(css, selector);

      expect(body, `no unconditional rule found for ${selector}`).not.toBeNull();
      expect(
        /flex-wrap:\s*wrap/.test(body as string),
        `${selector} must declare "flex-wrap: wrap" in its base rule. Wrapping ` +
          `only inside @media (max-width: …) leaves a band — reachable by ` +
          `browser zoom — where the row overflows and .myk9-entries-card's ` +
          `overflow:hidden clips the buttons with no visible affordance.`
      ).toBe(true);
    });
  }

  it('the mobile block no longer needs to grant wrapping', () => {
    // Once the base rule wraps, a duplicate inside the breakpoint is dead
    // weight that invites someone to "consolidate" it back to conditional.
    const mobileBlocks = css.match(/@media[^{]*max-width:\s*768px[^{]*\{[\s\S]*?\n\}/g) ?? [];
    const stillGrantsWrap = mobileBlocks.some(block =>
      /\.myk9-entries-action-buttons\s*\{[^}]*flex-wrap:\s*wrap/.test(block)
    );
    expect(
      stillGrantsWrap,
      'flex-wrap:wrap is now unconditional; drop the redundant declaration ' +
        'from the max-width:768px block so there is one source of truth.'
    ).toBe(false);
  });
});
