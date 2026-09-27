import { describe, expect, it } from 'vitest';
import { boxesIntersect, isInsideViewport } from './geometryOverlap';

describe('boxesIntersect', () => {
  it('flags a Decline button half covered by a fixed bottom bar', () => {
    // The MYK9-809 shape: a button whose bottom half sits under a fixed
    // bottom-nav-style bar.
    const declineButton = { top: 780, bottom: 820, left: 20, right: 140 };
    const fixedBottomBar = { top: 800, bottom: 844, left: 0, right: 390 };
    expect(boxesIntersect(declineButton, fixedBottomBar)).toBe(true);
  });

  it('does not flag a button that clears a fixed bottom bar', () => {
    const declineButton = { top: 700, bottom: 740, left: 20, right: 140 };
    const fixedBottomBar = { top: 800, bottom: 844, left: 0, right: 390 };
    expect(boxesIntersect(declineButton, fixedBottomBar)).toBe(false);
  });

  it('does not count merely touching edges as an overlap', () => {
    const a = { top: 0, bottom: 100, left: 0, right: 100 };
    const b = { top: 100, bottom: 200, left: 0, right: 100 };
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it('flags overlap on the horizontal axis too', () => {
    const a = { top: 0, bottom: 100, left: 0, right: 100 };
    const b = { top: 0, bottom: 100, left: 99, right: 200 };
    expect(boxesIntersect(a, b)).toBe(true);
  });
});

describe('isInsideViewport', () => {
  const viewport = { width: 260, height: 563 };

  it('accepts a box fully within the viewport', () => {
    expect(isInsideViewport({ top: 500, bottom: 540, left: 20, right: 140 }, viewport)).toBe(true);
  });

  it('rejects a box whose bottom edge sits below the viewport', () => {
    expect(isInsideViewport({ top: 540, bottom: 580, left: 20, right: 140 }, viewport)).toBe(false);
  });

  it('rejects a box whose right edge sits past the viewport', () => {
    expect(isInsideViewport({ top: 500, bottom: 540, left: 200, right: 300 }, viewport)).toBe(
      false
    );
  });

  it('tolerates sub-pixel rounding at the exact edge', () => {
    expect(isInsideViewport({ top: 500, bottom: 563.4, left: 20, right: 140 }, viewport)).toBe(
      true
    );
  });
});
