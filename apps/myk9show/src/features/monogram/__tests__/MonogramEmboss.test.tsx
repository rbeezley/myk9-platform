import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MonogramEmboss } from '../components/MonogramEmboss';
import { monogramColors } from '../tokens';

// JSDOM does not implement CSS.supports for background-clip:text, so by
// default the component should detect the lack of support and render with
// solid color. Tests that want to exercise the embossed-styles branch must
// stub CSS.supports explicitly.

function stubCssSupports(supported: boolean): () => void {
  const originalCSS = window.CSS;
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    value: {
      ...(originalCSS ?? {}),
      supports: vi.fn().mockReturnValue(supported),
    },
  });
  return () => {
    Object.defineProperty(window, 'CSS', { configurable: true, value: originalCSS });
  };
}

describe('MonogramEmboss', () => {
  it('renders the provided letters', () => {
    const { getByText } = render(<MonogramEmboss letters="BC" size={64} />);
    expect(getByText('BC')).toBeInTheDocument();
  });

  it('falls back to "?" when letters is empty (defensive)', () => {
    const { getByText } = render(<MonogramEmboss letters="" size={64} />);
    expect(getByText('?')).toBeInTheDocument();
  });

  it('is aria-hidden by default (decorative)', () => {
    const { getByText } = render(<MonogramEmboss letters="BC" size={64} />);
    expect(getByText('BC')).toHaveAttribute('aria-hidden', 'true');
  });

  it('respects ariaHidden=false when caller treats it as content', () => {
    const { getByText } = render(<MonogramEmboss letters="BC" size={64} ariaHidden={false} />);
    expect(getByText('BC')).toHaveAttribute('aria-hidden', 'false');
  });

  it('applies the requested size to fontSize', () => {
    const { getByText } = render(<MonogramEmboss letters="BC" size={280} />);
    expect(getByText('BC')).toHaveStyle({ fontSize: '280px' });
  });

  describe('with background-clip:text supported', () => {
    it('paper surface (default): renders embossed gradient styles', () => {
      const restore = stubCssSupports(true);
      try {
        const { getByText, rerender } = render(<MonogramEmboss letters="BC" size={64} />);
        // First render reflects null (pre-effect) — solid fallback. Force a
        // second render after the effect by re-rendering with same props; the
        // useEffect from useSupportsBackgroundClipText flushes here.
        rerender(<MonogramEmboss letters="BC" size={64} />);
        const el = getByText('BC');
        // JSDOM normalizes `color: transparent` to `rgba(0, 0, 0, 0)`; assert
        // via raw style string to accept either form.
        const style = el.getAttribute('style') ?? '';
        expect(style).toMatch(/color:\s*(transparent|rgba\(0,\s*0,\s*0,\s*0\))/);
        expect(style).toMatch(/linear-gradient/);
      } finally {
        restore();
      }
    });

    it('dark surface: renders the dark gradient', () => {
      const restore = stubCssSupports(true);
      try {
        const { getByText, rerender } = render(
          <MonogramEmboss letters="BC" size={580} surface="dark" />
        );
        rerender(<MonogramEmboss letters="BC" size={580} surface="dark" />);
        const el = getByText('BC');
        const style = el.getAttribute('style') ?? '';
        expect(style).toMatch(/linear-gradient/);
        // JSDOM rewrites hex `#1c1815` → `rgb(28, 24, 21)`. Match either.
        expect(style).toMatch(/#1c1815|rgb\(28,\s*24,\s*21\)/);
      } finally {
        restore();
      }
    });
  });

  describe('with background-clip:text unsupported (Outlook/IE/JSDOM)', () => {
    it('falls back to solid color (default ink)', () => {
      const restore = stubCssSupports(false);
      try {
        const { getByText } = render(<MonogramEmboss letters="BC" size={64} />);
        expect(getByText('BC')).toHaveStyle({ color: monogramColors.ink });
      } finally {
        restore();
      }
    });

    it('falls back to the provided solidColor', () => {
      const restore = stubCssSupports(false);
      try {
        const { getByText } = render(
          <MonogramEmboss letters="BC" size={64} solidColor={monogramColors.bronze} />
        );
        expect(getByText('BC')).toHaveStyle({ color: monogramColors.bronze });
      } finally {
        restore();
      }
    });
  });

  describe('solid variant (no emboss requested)', () => {
    it('uses solidColor regardless of background-clip support', () => {
      const restore = stubCssSupports(true);
      try {
        const { getByText } = render(
          <MonogramEmboss
            letters="BC"
            size={32}
            variant="solid"
            solidColor={monogramColors.bronze}
          />
        );
        expect(getByText('BC')).toHaveStyle({ color: monogramColors.bronze });
      } finally {
        restore();
      }
    });
  });
});
