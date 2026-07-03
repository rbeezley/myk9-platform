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
    expect(classList).toContain('border-primary bg-primary/5');
    expect(classList).toContain('fill-primary text-primary');
    expect(classList).not.toContain('emerald');
  });
});
