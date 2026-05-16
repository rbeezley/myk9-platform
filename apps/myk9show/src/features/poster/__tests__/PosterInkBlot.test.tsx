import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterInkBlot } from '../components/PosterInkBlot';

describe('PosterInkBlot', () => {
  it('renders an aria-hidden div with the data-testid', () => {
    const { getByTestId } = render(<PosterInkBlot />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to 720px diameter and the hero corner position', () => {
    const { getByTestId } = render(<PosterInkBlot />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.style.width).toBe('720px');
    expect(blot.style.height).toBe('720px');
    expect(blot.style.top).toBe('80px');
    expect(blot.style.right).toBe('-180px');
  });

  it('respects size and position overrides', () => {
    const { getByTestId } = render(
      <PosterInkBlot size={240} position={{ top: -100, right: -100 }} />
    );
    const blot = getByTestId('poster-ink-blot');
    expect(blot.style.width).toBe('240px');
    expect(blot.style.height).toBe('240px');
    expect(blot.style.top).toBe('-100px');
    expect(blot.style.right).toBe('-100px');
  });

  it('uses mix-blend-mode multiply by default', () => {
    const { getByTestId } = render(<PosterInkBlot />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.style.mixBlendMode).toBe('multiply');
  });

  it('honours blendMode override', () => {
    const { getByTestId } = render(<PosterInkBlot blendMode="normal" />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.style.mixBlendMode).toBe('normal');
  });

  it('builds a radial gradient from red to redDeep', () => {
    const { getByTestId } = render(<PosterInkBlot />);
    const blot = getByTestId('poster-ink-blot');
    // jsdom converts inline hex to rgb() in the serialized background string.
    const bg = blot.style.background;
    expect(bg).toContain('radial-gradient');
    expect(bg).toContain('rgb(200, 59, 26)'); // #c83b1a — posterColors.red
    expect(bg).toContain('rgb(138, 40, 16)'); // #8a2810 — posterColors.redDeep
  });

  it('omits the entry-animation class when staticMount is true', () => {
    const { getByTestId } = render(<PosterInkBlot staticMount />);
    const blot = getByTestId('poster-ink-blot');
    expect(blot.className).not.toContain('po-ink-blot--animate');
    expect(blot.className).toContain('po-ink-blot');
  });

  it('includes the animation class by default', () => {
    const { getByTestId } = render(<PosterInkBlot />);
    expect(getByTestId('poster-ink-blot').className).toContain('po-ink-blot--animate');
  });

  it('disables the drop-shadow filter when filter=null', () => {
    const { getByTestId } = render(<PosterInkBlot filter={null} />);
    expect(getByTestId('poster-ink-blot').style.filter).toBe('');
  });
});
