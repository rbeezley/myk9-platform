import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterSectionHead } from '../components/PosterSectionHead';

describe('PosterSectionHead', () => {
  it('renders the folio number with the № prefix and uppercased label', () => {
    const { container } = render(
      <PosterSectionHead number="04" label="judges">
        Two judges
      </PosterSectionHead>
    );
    expect(container.textContent).toContain('№ 04 / JUDGES');
  });

  it('renders the heading content as an h2', () => {
    const { container } = render(
      <PosterSectionHead number="01" label="Welcome">
        A note from the chair.
      </PosterSectionHead>
    );
    expect(container.querySelector('h2')?.textContent).toBe('A note from the chair.');
  });

  it('paints the folio number in red by default', () => {
    const { container } = render(
      <PosterSectionHead number="03" label="Judges">
        x
      </PosterSectionHead>
    );
    const folio = container.querySelector('.po-section-head > div') as HTMLElement;
    expect(folio.style.color).toBe('rgb(200, 59, 26)');
  });

  it('honours numberColor and titleColor overrides (used on dark/olive bands)', () => {
    const { container } = render(
      <PosterSectionHead
        number="06"
        label="On the day"
        numberColor="#ffffff"
        titleColor="#f3ede0"
      >
        Title
      </PosterSectionHead>
    );
    const folio = container.querySelector('.po-section-head > div') as HTMLElement;
    expect(folio.style.color).toBe('rgb(255, 255, 255)');
    const title = container.querySelector('h2') as HTMLElement;
    expect(title.style.color).toBe('rgb(243, 237, 224)');
  });

  it('accepts ReactNode titles with nested colored spans', () => {
    const { container } = render(
      <PosterSectionHead number="02" label="Particulars">
        The <span style={{ color: '#c83b1a' }}>facts.</span>
      </PosterSectionHead>
    );
    expect(container.querySelector('h2 span')?.textContent).toBe('facts.');
  });
});
