import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  deriveBannerBrandColors,
  useBannerBrandColor,
} from '../hooks/useBannerBrandColor';

describe('deriveBannerBrandColors', () => {
  it('returns default deep teal when input is null', () => {
    expect(deriveBannerBrandColors(null).flag).toBe('#0d4d4f');
  });

  it('returns default deep teal when input is undefined', () => {
    expect(deriveBannerBrandColors(undefined).flag).toBe('#0d4d4f');
  });

  it('returns default deep teal when input is malformed', () => {
    expect(deriveBannerBrandColors('not-a-hex').flag).toBe('#0d4d4f');
    expect(deriveBannerBrandColors('#xyz').flag).toBe('#0d4d4f');
    expect(deriveBannerBrandColors('red').flag).toBe('#0d4d4f');
  });

  it('accepts a valid 6-digit hex (lowercase)', () => {
    expect(deriveBannerBrandColors('#1a4d80').flag).toBe('#1a4d80');
  });

  it('accepts a valid 6-digit hex (uppercase)', () => {
    expect(deriveBannerBrandColors('#1A4D80').flag).toBe('#1A4D80');
  });

  it('derives a darker sibling than the input', () => {
    const out = deriveBannerBrandColors('#1a7679');
    // flagDeep should be visibly darker — first hex byte should drop
    expect(parseInt(out.flagDeep.slice(1, 3), 16)).toBeLessThan(0x1a);
  });

  it('derives a brighter sibling than the input', () => {
    const out = deriveBannerBrandColors('#0d4d4f');
    // flagBright should be visibly brighter — first hex byte should rise
    expect(parseInt(out.flagBright.slice(1, 3), 16)).toBeGreaterThan(0x0d);
  });

  it('returns white text on a dark flag (default teal)', () => {
    expect(deriveBannerBrandColors('#0d4d4f').textOnFlag).toBe('#ffffff');
  });

  it('returns ink text on a very light flag', () => {
    // Near-white flag should require dark text for contrast.
    expect(deriveBannerBrandColors('#fafaaa').textOnFlag).toBe('#111111');
  });

  it('returns ink text on a mid-bright flag above the 0.5 luminance threshold', () => {
    expect(deriveBannerBrandColors('#cccccc').textOnFlag).toBe('#111111');
  });

  it('returns white text on a near-black flag', () => {
    expect(deriveBannerBrandColors('#222222').textOnFlag).toBe('#ffffff');
  });
});

describe('useBannerBrandColor', () => {
  it('reads brand_color off the show row', () => {
    const { result } = renderHook(() =>
      useBannerBrandColor({ brand_color: '#1a4d80' })
    );
    expect(result.current.flag).toBe('#1a4d80');
  });

  it('returns default when show is null', () => {
    const { result } = renderHook(() => useBannerBrandColor(null));
    expect(result.current.flag).toBe('#0d4d4f');
  });

  it('returns default when show has no brand_color', () => {
    const { result } = renderHook(() => useBannerBrandColor({}));
    expect(result.current.flag).toBe('#0d4d4f');
  });

  it('memoizes — same brand_color input produces stable reference across renders', () => {
    const { result, rerender } = renderHook(
      ({ brand_color }: { brand_color: string }) => useBannerBrandColor({ brand_color }),
      { initialProps: { brand_color: '#0d4d4f' } }
    );
    const first = result.current;
    rerender({ brand_color: '#0d4d4f' });
    expect(result.current).toBe(first);
  });
});
