import { describe, it, expect } from 'vitest';
import { reorderLayoutMode } from '../reorderLayoutMode';

describe('reorderLayoutMode — reduced-motion gating for reorder animation', () => {
  it('animates position when reduced motion is NOT preferred', () => {
    expect(reorderLayoutMode(false)).toBe('position');
  });

  it('disables the layout animation when reduced motion IS preferred', () => {
    expect(reorderLayoutMode(true)).toBe(false);
  });

  it('treats a null preference (SSR / not-yet-resolved) as motion allowed', () => {
    // framer's useReducedMotion can return null before it resolves; default to
    // the animated path rather than suppressing motion on a transient null.
    expect(reorderLayoutMode(null)).toBe('position');
  });
});
