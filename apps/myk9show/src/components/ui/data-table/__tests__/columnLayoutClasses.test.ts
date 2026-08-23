// @vitest-environment node
import { describe, it, expect } from 'vitest';
import defaultTheme from 'tailwindcss/defaultTheme';
import {
  getColumnLayoutClasses,
  RESPONSIVE_CLASSES,
  STICKY_LEFT_BODY_CLASSES,
  STICKY_LEFT_HEADER_CLASSES,
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
});

describe('breakpoint premise', () => {
  // `responsiveHide: 'md'` only means "hidden on a phone, present from tablet
  // up" while `md` is Tailwind's stock 768px. Nothing else in the app would
  // fail if a dependency bump moved it, so read the installed package rather
  // than trusting the documented default.
  //
  // The other half of the premise — that `apps/myk9show/tailwind.config.js`
  // does not override `theme.screens` — is checked by hand: the config is
  // plain JS with no type declaration, so importing it here fails
  // `typecheck:tests`. It carries no `screens` key as of this change.
  it('md is Tailwind stock 768px in the installed package', () => {
    expect(defaultTheme.screens.md).toBe('768px');
  });
});
