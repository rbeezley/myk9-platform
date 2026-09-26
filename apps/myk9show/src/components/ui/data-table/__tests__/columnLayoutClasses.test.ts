// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import defaultTheme from 'tailwindcss/defaultTheme';
import {
  getColumnLayoutClasses,
  RESPONSIVE_CLASSES,
  STICKY_LEFT_BODY_CLASSES,
  STICKY_LEFT_HEADER_CLASSES,
  STICKY_LEFT_LEAD_HEADER_CLASSES,
  STICKY_LEFT_LEAD_BODY_CLASSES,
  STICKY_LEFT_LEAD_WIDTH_CLASS,
  STICKY_LEFT_AFTER_LEAD_HEADER_CLASSES,
  STICKY_LEFT_AFTER_LEAD_BODY_CLASSES,
  STICKY_RIGHT_HEADER_CLASSES,
  STICKY_RIGHT_BODY_CLASSES,
} from '../types';

describe('getColumnLayoutClasses', () => {
  it('returns nothing for a column with no layout meta', () => {
    expect(getColumnLayoutClasses(undefined, 'header')).toBe('');
    expect(getColumnLayoutClasses({}, 'body')).toBe('');
    expect(getColumnLayoutClasses({ exportHeader: 'Name' }, 'body')).toBe('');
  });

  it('hides a responsiveHide column below its breakpoint and shows it at or above', () => {
    // The two halves of the contract: `hidden` is unconditional, the
    // breakpoint-prefixed `table-cell` puts it back at the breakpoint.
    expect(getColumnLayoutClasses({ responsiveHide: 'md' }, 'body')).toBe('hidden md:table-cell');
    expect(getColumnLayoutClasses({ responsiveHide: 'lg' }, 'header')).toBe('hidden lg:table-cell');
  });

  it('pins a stickyLeft column to the left edge in both header and body cells', () => {
    const header = getColumnLayoutClasses({ stickyLeft: true }, 'header');
    const body = getColumnLayoutClasses({ stickyLeft: true }, 'body');

    for (const classes of [header, body]) {
      expect(classes.split(' ')).toEqual(expect.arrayContaining(['sticky', 'left-0']));
      // Opaque, or the columns scrolling underneath show straight through.
      expect(classes).toContain('bg-card');
    }

    expect(header).toBe(STICKY_LEFT_HEADER_CLASSES);
    expect(body).toBe(STICKY_LEFT_BODY_CLASSES);
    // Only a body cell can sit in a selected row, and an opaque pin would
    // otherwise cover that row's own background.
    expect(body).toContain('group-data-[state=selected]/row:bg-muted');
    expect(header).not.toContain('group-data-');
  });

  // Verified against a real Tailwind build of this app: `muted`, `border` and
  // `card` are bare `var(--…)` values, so Tailwind emits NOTHING at all for
  // `bg-muted/30` or `border-border/50` — the utility silently does not exist.
  // (`src/index.css` hand-writes `color-mix()` rules for a fixed list of
  // `primary` opacities precisely because of this, and covers no other token.)
  // A pin styled with one would look unstyled in the browser while every test
  // that only inspected class strings stayed green.
  it('uses no opacity modifier, which would compile to nothing for these tokens', () => {
    for (const classes of [STICKY_LEFT_HEADER_CLASSES, STICKY_LEFT_BODY_CLASSES]) {
      const withOpacity = classes.split(' ').filter(c => /\/\d/.test(c));
      expect(withOpacity).toEqual([]);
    }
  });

  it('combines both when a column is pinned and responsive', () => {
    const classes = getColumnLayoutClasses({ responsiveHide: 'lg', stickyLeft: true }, 'body');
    expect(classes).toContain(RESPONSIVE_CLASSES.lg);
    expect(classes).toContain(STICKY_LEFT_BODY_CLASSES);
  });

  // MYK9-592: a stickyLeftLead column (the dogs-table select checkbox) pins at
  // left-0 with a FIXED width and a z-index above a trailing `afterLead`
  // column, and that trailing column pins at an offset equal to the lead's
  // width instead of at left-0 — so the two sit side by side under scroll
  // rather than the trailing pin sliding on top of the leading one.
  describe('a leading pinned column plus a trailing afterLead column', () => {
    it('pins the lead column at left-0 with a fixed width, above the trailing pin', () => {
      const header = getColumnLayoutClasses({ stickyLeftLead: true }, 'header');
      const body = getColumnLayoutClasses({ stickyLeftLead: true }, 'body');

      expect(header).toBe(STICKY_LEFT_LEAD_HEADER_CLASSES);
      expect(body).toBe(STICKY_LEFT_LEAD_BODY_CLASSES);
      for (const classes of [header, body]) {
        // `w-10` alone is only a width HINT under table-layout: auto —
        // `min-w-10`/`max-w-10` are what actually pins it, since a wider
        // cell elsewhere in the column could otherwise grow it and silently
        // break the trailing column's hardcoded offset (round-2 review).
        expect(classes.split(' ')).toEqual(
          expect.arrayContaining([
            'sticky',
            'left-0',
            STICKY_LEFT_LEAD_WIDTH_CLASS,
            'min-w-10',
            'max-w-10',
            'bg-card',
          ])
        );
        // No hairline of its own — the trailing (afterLead) column draws the
        // one hairline for the whole pinned block, at ITS right edge; a
        // second one here would be a spurious divider between the checkbox
        // and Name (round-2 review).
        expect(classes).not.toContain("after:content-['']");
      }
      // Above the trailing column's z-20 header / z-10 body (asserted below),
      // or the lead checkbox's enlarged tap-target pseudo-element would paint
      // underneath the trailing column when it overhangs into it.
      expect(header).toContain('z-30');
      expect(body).toContain('z-20');
    });

    it('pins the trailing column after the lead, not at left-0', () => {
      const header = getColumnLayoutClasses({ stickyLeft: { afterLead: true } }, 'header');
      const body = getColumnLayoutClasses({ stickyLeft: { afterLead: true } }, 'body');

      expect(header).toBe(STICKY_LEFT_AFTER_LEAD_HEADER_CLASSES);
      expect(body).toBe(STICKY_LEFT_AFTER_LEAD_BODY_CLASSES);
      for (const classes of [header, body]) {
        expect(classes.split(' ')).not.toContain('left-0');
        // The offset must equal the lead's own width, or the two would
        // overlap or leave a gap.
        expect(classes).toContain(`left-${STICKY_LEFT_LEAD_WIDTH_CLASS.replace('w-', '')}`);
      }
      expect(header).toContain('z-20');
      expect(body).toContain('z-10');
    });

    // Round-2 review: `stickyLeftLead` and `stickyLeft` had no runtime or
    // compile-time guard against being set on the same column, which would
    // silently pick whichever branch's `if` ran first rather than fail loud.
    it('throws when a column sets both stickyLeftLead and stickyLeft', () => {
      expect(() =>
        getColumnLayoutClasses({ stickyLeftLead: true, stickyLeft: true }, 'header')
      ).toThrow(/mutually exclusive/);
      expect(() =>
        getColumnLayoutClasses({ stickyLeftLead: true, stickyLeft: { afterLead: true } }, 'body')
      ).toThrow(/mutually exclusive/);
    });
  });

  it('pins a stickyRight column to the right edge, opaque, with its hairline on the left', () => {
    const header = getColumnLayoutClasses({ stickyRight: true }, 'header');
    const body = getColumnLayoutClasses({ stickyRight: true }, 'body');
    expect(header).toBe(STICKY_RIGHT_HEADER_CLASSES);
    expect(body).toBe(STICKY_RIGHT_BODY_CLASSES);
    for (const classes of [header, body]) {
      expect(classes.split(' ')).toEqual(expect.arrayContaining(['sticky', 'right-0', 'bg-card']));
      expect(classes).toContain('before:left-0');
      expect(classes.split(' ')).not.toContain('left-0');
    }
    // Header above body, as for the left pin, so a scrolled header covers the cell.
    expect(header).toContain('z-20');
    expect(body).toContain('z-10');
  });
});

describe('breakpoint premise', () => {
  // `responsiveHide` only means anything in device widths while the app is on
  // Tailwind's stock scale. Two assertions, because `defaultTheme` is a COPY of
  // that scale, not the app's resolved config: reading it alone would agree
  // with the app by coincidence, and a `screens` override would move the real
  // breakpoint while this file stayed green.
  const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

  it('is Tailwind stock: md 768px, lg 1024px', () => {
    expect(defaultTheme.screens.md).toBe('768px');
    // `lg` is the one MYK9-222 rests on — Breed and Sex must clear every tablet
    // (Surface is the widest at 912) and return by the narrowest desktop.
    expect(defaultTheme.screens.lg).toBe('1024px');
  });

  it('and this app does not override the screens scale', () => {
    const config = readFileSync(resolve(APP_ROOT, 'tailwind.config.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');

    // Not cosmetic: setting `lg: '640px'` here would put Breed and Sex back on
    // an iPad and reinstate the MYK9-222 defect, and every breakpoint test in
    // this repo would still pass — they all read `defaultTheme`. If this fails,
    // the override is not necessarily wrong; the device-width assertions in
    // `DogsTableView.test.tsx` need to be re-derived from the real config.
    expect(config).not.toMatch(/\bscreens\s*:/);
  });
});
