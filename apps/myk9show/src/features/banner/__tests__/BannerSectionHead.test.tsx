import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BannerSectionHead } from '../components/BannerSectionHead';

describe('BannerSectionHead', () => {
  it('renders the folio number and uppercased label as "NN / LABEL"', () => {
    const { container } = render(
      <BannerSectionHead number="04" label="roster" flag="#0d4d4f">
        Filling
      </BannerSectionHead>
    );
    expect(container.textContent).toContain('04 / ROSTER');
  });

  it('renders the heading as an h2', () => {
    const { container } = render(
      <BannerSectionHead number="01" label="Welcome" flag="#0d4d4f">
        A note from the chair.
      </BannerSectionHead>
    );
    expect(container.querySelector('h2')?.textContent).toBe('A note from the chair.');
  });

  it('paints the folio number with the supplied flag color', () => {
    const { container } = render(
      <BannerSectionHead number="03" label="Judges" flag="#7a1f1f">
        Two judges, panel
      </BannerSectionHead>
    );
    const folio = container.querySelector('.bn-section-head > div') as HTMLElement;
    expect(folio.style.color).toBe('rgb(122, 31, 31)');
  });

  it('exposes the flag color as a CSS var on the head element', () => {
    const { container } = render(
      <BannerSectionHead number="02" label="x" flag="#7a1f1f">
        Title
      </BannerSectionHead>
    );
    const header = container.querySelector('.bn-section-head') as HTMLElement;
    expect(header.style.getPropertyValue('--bn-section-flag')).toBe('#7a1f1f');
  });

  it('accepts ReactNode titles with nested spans', () => {
    const { container } = render(
      <BannerSectionHead number="01" label="x" flag="#0d4d4f">
        Filling <span style={{ color: '#0d4d4f' }}>fast.</span>
      </BannerSectionHead>
    );
    expect(container.querySelector('h2 span')?.textContent).toBe('fast.');
  });
});
