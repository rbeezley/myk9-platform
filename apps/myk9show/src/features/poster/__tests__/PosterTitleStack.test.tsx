import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterTitleStack } from '../components/PosterTitleStack';

describe('PosterTitleStack', () => {
  it('renders each word as a span', () => {
    const { container } = render(
      <PosterTitleStack
        words={[
          { text: 'SPRING' },
          { text: 'SCENT' },
          { text: 'WORK.' },
        ]}
      />
    );
    const spans = container.querySelectorAll('.po-hero-title-word');
    expect(spans.length).toBe(3);
    expect(spans[0]?.textContent).toBe('SPRING');
    expect(spans[2]?.textContent).toBe('WORK.');
  });

  it('paints red variant', () => {
    const { container } = render(
      <PosterTitleStack words={[{ text: 'SCENT', variant: 'red' }]} />
    );
    const span = container.querySelector('.po-hero-title-word') as HTMLElement;
    expect(span.style.color).toBe('rgb(200, 59, 26)');
  });

  it('paints olive variant', () => {
    const { container } = render(
      <PosterTitleStack words={[{ text: 'WORK', variant: 'olive' }]} />
    );
    const span = container.querySelector('.po-hero-title-word') as HTMLElement;
    expect(span.style.color).toBe('rgb(61, 58, 42)');
  });

  it('renders outline variant with transparent fill', () => {
    const { container } = render(
      <PosterTitleStack words={[{ text: 'TODAY', variant: 'outline' }]} />
    );
    const span = container.querySelector('.po-hero-title-word') as HTMLElement;
    expect(span.style.color).toBe('transparent');
    expect(span.style.WebkitTextStroke).toBeTruthy();
  });

  it('renders cream-on-ink variant as an inline-block stamp', () => {
    const { container } = render(
      <PosterTitleStack words={[{ text: "'26", variant: 'cream-on-ink' }]} />
    );
    const span = container.querySelector('.po-hero-title-word') as HTMLElement;
    expect(span.style.background).toBe('rgb(31, 29, 24)');
    expect(span.style.color).toBe('rgb(243, 237, 224)');
    expect(span.style.display).toBe('inline-block');
  });

  it('clamps size to 18px floor', () => {
    const { container } = render(
      <PosterTitleStack words={[{ text: 'X' }]} size={10} />
    );
    const span = container.querySelector('.po-hero-title-word') as HTMLElement;
    expect(span.style.fontSize).toBe('18px');
  });
});
