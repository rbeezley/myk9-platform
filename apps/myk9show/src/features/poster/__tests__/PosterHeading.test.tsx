import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterHeading } from '../components/PosterHeading';
import { posterColors } from '../tokens';

describe('PosterHeading', () => {
  it('renders as h2 by default', () => {
    const { container } = render(<PosterHeading>Hello</PosterHeading>);
    expect(container.querySelector('h2')).toBeTruthy();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('honours the as prop', () => {
    const { container } = render(<PosterHeading as="h1">Big</PosterHeading>);
    expect(container.querySelector('h1')?.textContent).toBe('Big');
  });

  it('clamps font size to 18px floor (Archivo Black never below 18px)', () => {
    const { container } = render(<PosterHeading size={10}>Small</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.fontSize).toBe('18px');
  });

  it('paints solid variant with ink color', () => {
    const { container } = render(<PosterHeading variant="solid">Ink</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.color.toLowerCase()).toBe('rgb(31, 29, 24)');
  });

  it('paints red variant with the hero red', () => {
    const { container } = render(<PosterHeading variant="red">Red</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.color).toBe('rgb(200, 59, 26)');
  });

  it('renders outline variant with transparent fill and webkit text-stroke', () => {
    const { container } = render(<PosterHeading variant="outline">Outline</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.color).toBe('transparent');
    expect(h.style.WebkitTextStroke).toContain(posterColors.ink);
  });

  it('renders cream variant for use over dark contexts', () => {
    const { container } = render(<PosterHeading variant="cream">Cream</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.color).toBe('rgb(243, 237, 224)');
  });

  it('renders olive variant', () => {
    const { container } = render(<PosterHeading variant="olive">Olive</PosterHeading>);
    const h = container.querySelector('h2') as HTMLElement;
    expect(h.style.color).toBe('rgb(61, 58, 42)');
  });
});
