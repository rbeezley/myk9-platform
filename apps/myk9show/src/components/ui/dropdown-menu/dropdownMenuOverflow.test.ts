/**
 * MYK9-138 — a dropdown taller than the viewport must be scrollable.
 *
 * The operator could not reach "Grant Show Access" on `/club-admin/members`:
 * that row menu carries ~10 items across three sections, and the popup ran off
 * the bottom of the screen with no scrollbar. Rows higher on the page worked,
 * which is what made it look like an intermittent glitch rather than a layout
 * bug.
 *
 * Asserted against the source text because the failure is purely CSS — jsdom
 * does not lay out or resolve `var()`, so a render-based test would pass
 * against the broken markup. Every popup here needs three things together:
 * a max-height, a FALLBACK for it, and vertical overflow.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'dropdown-menu.tsx'), 'utf8');

/**
 * Every RENDERED popup surface. Split on the JSX opening specifically —
 * `typeof MenuPrimitive.Popup` appears in the forwardRef type parameters and is
 * not a styled element.
 */
const popupClassNames = source
  .split('<MenuPrimitive.Popup')
  .slice(1)
  // Only this popup's own className — a fixed-size window bleeds into the next
  // component and reports its classes as this one's.
  .map(chunk => {
    const start = chunk.indexOf('className={cn(');
    const end = chunk.indexOf(')}', start);
    const block = start >= 0 && end > start ? chunk.slice(start, end) : '';
    // Drop comments — prose ABOUT a class must not read as the class itself.
    return block.replace(/\/\/[^\n]*/g, '');
  });

describe('dropdown popups are bounded and scrollable', () => {
  it('finds every popup in the file', () => {
    // Guards against the check silently covering nothing if the file is
    // restructured — the submenu popup was missed on the first pass.
    expect(popupClassNames.length).toBeGreaterThanOrEqual(2);
  });

  it.each(popupClassNames.map((c, i) => [i, c]))('popup %i is height-bounded', (_i, chunk) => {
    expect(chunk).toMatch(/max-h-\[var\(--available-height/);
  });

  it.each(popupClassNames.map((c, i) => [i, c]))(
    'popup %i bounds itself even when the positioner sets no variable',
    (_i, chunk) => {
      // `max-h-[var(--available-height)]` with the variable UNSET is an invalid
      // declaration: no max-height, so `overflow-y-auto` never engages and the
      // menu simply runs off-screen. The fallback is the load-bearing part.
      expect(chunk).toMatch(/max-h-\[var\(--available-height,[^\]]+\)\]/);
    }
  );

  it.each(popupClassNames.map((c, i) => [i, c]))('popup %i scrolls vertically', (_i, chunk) => {
    expect(chunk).toMatch(/overflow-y-auto/);
    // `overflow-hidden` would clip the overflow instead of scrolling it.
    expect(chunk).not.toMatch(/(?<!overflow-x-)overflow-hidden/);
  });

  it('keeps every popup off the viewport edges', () => {
    const positioners = source.split('<MenuPrimitive.Positioner').slice(1);
    expect(positioners.length).toBeGreaterThanOrEqual(2);
    for (const p of positioners) {
      expect(p.slice(0, 700)).toMatch(/collisionPadding/);
    }
  });

  it('flips every popup instead of squeezing it into the preferred side', () => {
    // Base UI defaults to `side: 'shift'`. Measured on the deployed app: the
    // last row's menu button had NINE pixels below it, so --available-height
    // resolved to 9px and the menu rendered as an unusable sliver. The
    // max-height fallback cannot help — the variable IS set, just tiny. Only
    // flipping to the opposite side finds real space.
    const positioners = source.split('<MenuPrimitive.Positioner').slice(1);
    for (const p of positioners) {
      expect(p.slice(0, 700)).toMatch(/collisionAvoidance=\{\{[^}]*side:\s*'flip'/);
    }
  });
});
