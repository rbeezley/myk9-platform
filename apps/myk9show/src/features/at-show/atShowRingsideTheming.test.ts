/**
 * Source-text regression guard (impeccable sweep page #8 — At-Show ringside).
 *
 * Pins the dark-mode/theming + calm-offline fixes so a refactor can't silently
 * reintroduce a raw Tailwind palette class (no dark: variant), a green
 * favorite highlight (green is reserved for live judging), or an alarm-orange
 * offline state (PRODUCT.md: "offline is normal, not broken"). These are
 * defects typecheck and render-snapshot tests are both blind to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(__dirname, p), 'utf8');
const scoresheet = read('AtShowScoresheetPage.tsx');
const classList = read('AtShowClassListPage.tsx');
const classRow = read('AtShowClassRow.tsx');

describe('At-Show ringside — calm offline + tokenized status', () => {
  it('renders the offline state in a calm neutral tone, not alarm-orange', () => {
    expect(scoresheet).toContain('badgeClass(');
    expect(scoresheet).toContain("'neutral'");
    expect(scoresheet).not.toContain('bg-orange-100');
    expect(scoresheet).not.toContain('text-orange-800');
  });

  it('keeps ringside neutral chips readable in light mode', () => {
    expect(classList).toContain('text-foreground transition-colors');
    expect(classList).toContain('var(--chip-stone-bg)');
    expect(classList).toContain('var(--chip-stone-fg)');
    expect(classList).not.toContain('text-muted-foreground transition-colors');
  });

  it('tints the syncing indicator with the info token (no raw amber)', () => {
    expect(scoresheet).toContain('bg-info/10 text-info');
    expect(scoresheet).not.toContain('bg-amber-100');
  });

  it('announces sync/offline state to assistive tech (role=status)', () => {
    expect(scoresheet).toContain('role="status"');
    expect(scoresheet).toContain('aria-live="polite"');
  });

  it('highlights a favorite class with the accent token, not raw green', () => {
    // Anchored to the is_favorite branch on purpose. A bare
    // toContain('border-primary') passes on `hover:border-primary/40` in the
    // BASE class string, so it would still be green with the favorite styling
    // deleted outright -- a pin that proves only that someone typed the word.
    expect(classRow).toMatch(/is_favorite &&\s*'[^']*border-primary/);
    expect(classRow).toContain('fill-primary text-primary');
    expect(classRow).not.toContain('emerald');
  });

  it('does not tint the favorite row background, which broke AA in dark mode', () => {
    // The tint was `bg-primary/5`. Composited over the dark card (#1e1c19) it
    // lightened the surface to #272120, dropping --muted-foreground (#8c8376)
    // from 4.55:1 to 4.26:1 -- under the 4.5:1 AA floor for the judge name,
    // times and counts on every favorited row. The filled Star and the primary
    // border already carry "favorite", so the tint was a third encoding whose
    // only distinct effect was the contrast loss.
    expect(classRow).not.toContain('bg-primary/5');
  });

  it('marks the in-ring dot with the at-show token rather than a raw hex', () => {
    // #f59e0b computes to 2.15:1 on the light card, under the 3:1 WCAG floor
    // for a non-text indicator. The token keeps it amber (never Ring Green)
    // while giving light mode its own value.
    expect(classRow).toContain('var(--at-show-in-ring)');
    // Scoped to an arbitrary-value BACKGROUND rather than the bare hex string:
    // the hex still appears in the comment above the dot explaining why it
    // moved, and a test that cannot tell code from prose would fail on the
    // explanation of its own fix.
    expect(classRow).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/);
  });
});
