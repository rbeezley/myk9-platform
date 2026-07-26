/**
 * MYK9-95 — unit coverage for the focus-indicator visibility parser.
 *
 * The keyboard walk in `slice5-a11y-keyboard.spec.ts` is only as trustworthy as
 * this parser. Two real bugs shipped in the first cut precisely because it was
 * exercised ONLY through a browser walk, whose pages happened not to produce
 * the inputs that break it. Both are pinned below.
 */
import { describe, it, expect } from 'vitest';
import {
  isTransparentColor,
  parseLeadingColor,
  visibleShadowLayers,
  ringSignature,
  isAllZeroLength,
  hasNonZeroLength,
  splitTopLevel,
  type StyleReading,
} from './focusIndicator';

describe('isTransparentColor', () => {
  it('does NOT read an opaque rgb() blue channel as an alpha channel', () => {
    // REGRESSION: a `/,\s*0\s*\)$/` pattern match calls plain black transparent
    // because its BLUE channel is zero, discarding a real visible ring and
    // failing the walk on a compliant control.
    expect(isTransparentColor('rgb(0, 0, 0)')).toBe(false);
    expect(isTransparentColor('rgb(255, 128, 0)')).toBe(false);
    expect(isTransparentColor('rgb(0,0,0)')).toBe(false);
  });

  it('detects a zero alpha in legacy rgba()/hsla() syntax', () => {
    expect(isTransparentColor('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparentColor('rgba(255, 255, 255, 0)')).toBe(true);
    expect(isTransparentColor('hsla(210, 50%, 50%, 0)')).toBe(true);
  });

  it('keeps partially and fully opaque alphas', () => {
    expect(isTransparentColor('rgba(0, 0, 0, 0.5)')).toBe(false);
    expect(isTransparentColor('rgba(0, 0, 0, 1)')).toBe(false);
    expect(isTransparentColor('rgba(0, 0, 0, 0.01)')).toBe(false);
  });

  it('handles CSS Color 4 slash syntax', () => {
    expect(isTransparentColor('rgb(0 0 0 / 0)')).toBe(true);
    expect(isTransparentColor('rgb(0 0 0 / 0%)')).toBe(true);
    expect(isTransparentColor('rgb(0 0 0 / 50%)')).toBe(false);
    expect(isTransparentColor('oklch(0.5 0.1 200 / 0)')).toBe(true);
    expect(isTransparentColor('oklch(0.5 0.1 200)')).toBe(false);
    expect(isTransparentColor('color(srgb 0 0 0 / 0)')).toBe(true);
    expect(isTransparentColor('color(srgb 0 0 0)')).toBe(false);
  });

  it('handles keywords, hex and empty values', () => {
    expect(isTransparentColor('transparent')).toBe(true);
    expect(isTransparentColor('')).toBe(true);
    expect(isTransparentColor('black')).toBe(false);
    expect(isTransparentColor('#000')).toBe(false);
    expect(isTransparentColor('#000000')).toBe(false);
    expect(isTransparentColor('#00000000')).toBe(true);
    expect(isTransparentColor('#0000')).toBe(true);
    expect(isTransparentColor('#000000ff')).toBe(false);
  });
});

describe('parseLeadingColor', () => {
  it('parses the whole colour function, not up to the first space', () => {
    // REGRESSION: `layer.split(' ')[0]` yields "rgba(0," so the alpha is never
    // seen, and a fully transparent placeholder layer counts as a visible ring.
    expect(parseLeadingColor('rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toEqual({
      color: 'rgba(0, 0, 0, 0)',
      rest: '0px 0px 0px 0px',
    });
    expect(parseLeadingColor('rgb(59, 130, 246) 0px 0px 0px 2px')).toEqual({
      color: 'rgb(59, 130, 246)',
      rest: '0px 0px 0px 2px',
    });
  });

  it('handles nested parens and keyword colours', () => {
    expect(parseLeadingColor('color(srgb 0 0 0 / 0.5) 0px 1px').color).toBe(
      'color(srgb 0 0 0 / 0.5)'
    );
    expect(parseLeadingColor('black 0px 1px 2px')).toEqual({ color: 'black', rest: '0px 1px 2px' });
  });
});

describe('splitTopLevel', () => {
  it('does not split inside colour functions', () => {
    expect(splitTopLevel('rgba(0, 0, 0, 0) 0px 0px, rgb(1, 2, 3) 1px 1px')).toEqual([
      'rgba(0, 0, 0, 0) 0px 0px',
      'rgb(1, 2, 3) 1px 1px',
    ]);
  });
});

describe('length helpers', () => {
  it('recognises all-zero and non-zero geometry', () => {
    expect(isAllZeroLength('0px 0px 0px 0px')).toBe(true);
    expect(isAllZeroLength('0px 0px 4px 0px')).toBe(false);
    expect(hasNonZeroLength('0px')).toBe(false);
    expect(hasNonZeroLength('2px')).toBe(true);
    expect(hasNonZeroLength('0px 1px 0px 0px')).toBe(true);
  });
});

describe('visibleShadowLayers', () => {
  it('drops a fully transparent Tailwind placeholder layer', () => {
    expect(visibleShadowLayers('rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toEqual([]);
  });

  it('drops an opaque layer whose geometry is entirely zero', () => {
    expect(visibleShadowLayers('rgb(0, 0, 0) 0px 0px 0px 0px')).toEqual([]);
  });

  it('keeps a real ring shadow', () => {
    expect(visibleShadowLayers('rgb(59, 130, 246) 0px 0px 0px 2px')).toEqual([
      'rgb(59, 130, 246) 0px 0px 0px 2px',
    ]);
  });

  it('keeps a real black ring — the opaque-rgb regression case', () => {
    expect(visibleShadowLayers('rgb(0, 0, 0) 0px 0px 0px 2px')).toEqual([
      'rgb(0, 0, 0) 0px 0px 0px 2px',
    ]);
  });

  it('keeps only the visible layers of a mixed Tailwind ring stack', () => {
    const stack =
      'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, ' +
      'rgb(168, 71, 45) 0px 0px 0px 2px';
    expect(visibleShadowLayers(stack)).toEqual(['rgb(168, 71, 45) 0px 0px 0px 2px']);
  });

  it('treats none and empty as nothing drawn', () => {
    expect(visibleShadowLayers('none')).toEqual([]);
    expect(visibleShadowLayers('')).toEqual([]);
  });
});

const reading = (props: Record<string, string>): StyleReading =>
  Object.fromEntries(Object.entries(props).map(([k, v]) => [`0|self|${k}`, v]));

describe('ringSignature', () => {
  it('is empty for a control whose only styling is a transparent outline-none', () => {
    // Tailwind `focus-visible:outline-none` — 2px of nothing.
    const sig = ringSignature(
      reading({
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineColor: 'rgba(0, 0, 0, 0)',
        outlineOffset: '2px',
        boxShadow: 'none',
        borderWidth: '0px',
        borderColor: 'rgb(0, 0, 0)',
        textDecorationLine: 'none',
      }),
      '0|self'
    );
    expect(sig).toBe('');
  });

  it('is empty for a zero-width border', () => {
    const sig = ringSignature(
      reading({
        outlineStyle: 'none',
        outlineWidth: '0px',
        outlineColor: 'rgb(0, 0, 0)',
        boxShadow: 'none',
        borderWidth: '0px',
        borderColor: 'rgb(228, 220, 204)',
        textDecorationLine: 'none',
      }),
      '0|self'
    );
    expect(sig).toBe('');
  });

  it('reports a visible opaque black outline', () => {
    const sig = ringSignature(
      reading({
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineColor: 'rgb(0, 0, 0)',
        outlineOffset: '2px',
        boxShadow: 'none',
        borderWidth: '0px',
        borderColor: 'rgb(0, 0, 0)',
        textDecorationLine: 'none',
      }),
      '0|self'
    );
    expect(sig).toBe('outline:solid/2px/rgb(0, 0, 0)/2px');
  });

  it('reports a real ring shadow and ignores transparent siblings', () => {
    const sig = ringSignature(
      reading({
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineColor: 'rgba(0, 0, 0, 0)',
        boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(168, 71, 45) 0px 0px 0px 2px',
        borderWidth: '0px',
        borderColor: 'rgb(0, 0, 0)',
        textDecorationLine: 'none',
      }),
      '0|self'
    );
    expect(sig).toBe('shadow:rgb(168, 71, 45) 0px 0px 0px 2px');
  });

  it('distinguishes a focused ring from the unfocused state of the same control', () => {
    const base = {
      outlineStyle: 'none',
      outlineWidth: '0px',
      outlineColor: 'rgb(0, 0, 0)',
      boxShadow: 'none',
      borderWidth: '1px',
      borderColor: 'rgb(228, 220, 204)',
      textDecorationLine: 'none',
    };
    const unfocused = ringSignature(reading(base), '0|self');
    const focused = ringSignature(
      reading({ ...base, boxShadow: 'rgb(168, 71, 45) 0px 0px 0px 2px' }),
      '0|self'
    );
    expect(focused).not.toBe(unfocused);
    expect(unfocused).toBe('border:1px/rgb(228, 220, 204)');
  });
});
