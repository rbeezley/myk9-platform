import { describe, expect, it } from 'vitest';
import {
  isTopmostOverlay,
  openOverlayCount,
  popOpenOverlay,
  pushOpenOverlay,
} from './overlayStack';

// Each test pushes and pops its own ids in full (never leaving one behind),
// so the module-level stack always returns to empty regardless of test
// order — required for CI's shuffled run (LESSONS vitest-shuffle).
describe('overlayStack', () => {
  it('reports the only pushed id as topmost', () => {
    const id = Symbol('a');
    pushOpenOverlay(id);
    try {
      expect(isTopmostOverlay(id)).toBe(true);
      expect(openOverlayCount()).toBe(1);
    } finally {
      popOpenOverlay(id);
    }
  });

  it('reports only the most recently pushed id as topmost', () => {
    const first = Symbol('first');
    const second = Symbol('second');
    pushOpenOverlay(first);
    pushOpenOverlay(second);
    try {
      expect(isTopmostOverlay(second)).toBe(true);
      expect(isTopmostOverlay(first)).toBe(false);
      expect(openOverlayCount()).toBe(2);
    } finally {
      popOpenOverlay(second);
      popOpenOverlay(first);
    }
  });

  it('promotes the next id to topmost once the current one pops', () => {
    const first = Symbol('first');
    const second = Symbol('second');
    pushOpenOverlay(first);
    pushOpenOverlay(second);
    try {
      popOpenOverlay(second);
      expect(isTopmostOverlay(first)).toBe(true);
      expect(openOverlayCount()).toBe(1);
    } finally {
      popOpenOverlay(first);
    }
  });

  it('reports nothing as topmost once the stack is empty', () => {
    const id = Symbol('a');
    pushOpenOverlay(id);
    popOpenOverlay(id);
    expect(isTopmostOverlay(id)).toBe(false);
    expect(openOverlayCount()).toBe(0);
  });

  it('is safe to pop an id more than once', () => {
    const id = Symbol('a');
    pushOpenOverlay(id);
    popOpenOverlay(id);
    popOpenOverlay(id);
    expect(openOverlayCount()).toBe(0);
  });
});
