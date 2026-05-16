import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterRotatingSquare } from '../components/PosterRotatingSquare';
import { posterSquareRotation } from '../tokens';

describe('PosterRotatingSquare', () => {
  it('renders an aria-hidden div with the data-testid', () => {
    const { getByTestId } = render(<PosterRotatingSquare />);
    const sq = getByTestId('poster-rotating-square');
    expect(sq.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to 320px size and the hero corner position', () => {
    const { getByTestId } = render(<PosterRotatingSquare />);
    const sq = getByTestId('poster-rotating-square');
    expect(sq.style.width).toBe('320px');
    expect(sq.style.height).toBe('320px');
    expect(sq.style.bottom).toBe('-80px');
    expect(sq.style.left).toBe('-80px');
  });

  it('applies the design-system 8deg rotation by default', () => {
    const { getByTestId } = render(<PosterRotatingSquare />);
    const sq = getByTestId('poster-rotating-square');
    expect(sq.style.transform).toBe(`rotate(${posterSquareRotation}deg)`);
  });

  it('honours a rotation override', () => {
    const { getByTestId } = render(<PosterRotatingSquare rotation={12} />);
    const sq = getByTestId('poster-rotating-square');
    expect(sq.style.transform).toBe('rotate(12deg)');
  });

  it('exposes the rotation as a CSS var for the keyframe to land on', () => {
    const { getByTestId } = render(<PosterRotatingSquare rotation={12} />);
    const sq = getByTestId('poster-rotating-square');
    expect(sq.style.getPropertyValue('--po-square-rot')).toBe('12deg');
  });

  it('uses olive as the default fill', () => {
    const { getByTestId } = render(<PosterRotatingSquare />);
    const sq = getByTestId('poster-rotating-square');
    // jsdom converts inline hex to rgb() — #3d3a2a → rgb(61, 58, 42).
    expect(sq.style.background).toBe('rgb(61, 58, 42)');
  });

  it('uses mix-blend-mode multiply by default', () => {
    const { getByTestId } = render(<PosterRotatingSquare />);
    expect(getByTestId('poster-rotating-square').style.mixBlendMode).toBe('multiply');
  });

  it('omits the animation class when staticMount is true', () => {
    const { getByTestId } = render(<PosterRotatingSquare staticMount />);
    expect(getByTestId('poster-rotating-square').className).not.toContain(
      'po-rotating-square--animate'
    );
  });
});
