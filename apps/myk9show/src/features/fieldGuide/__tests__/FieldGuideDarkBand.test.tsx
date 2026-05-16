import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FieldGuideDarkBand } from '../components/FieldGuideDarkBand';

describe('FieldGuideDarkBand', () => {
  it('paints the dark paper-deep background and pale paper text', () => {
    const { container } = render(<FieldGuideDarkBand>BCKC.2026.SS</FieldGuideDarkBand>);
    const band = container.querySelector('.fg-dark-band') as HTMLElement;
    expect(band.style.background).toBe('rgb(31, 42, 36)');
    expect(band.style.color).toBe('rgb(246, 241, 230)');
  });

  it('uses the mono font family for default chrome', () => {
    const { container } = render(<FieldGuideDarkBand>STRIP</FieldGuideDarkBand>);
    const band = container.querySelector('.fg-dark-band') as HTMLElement;
    expect(band.style.fontFamily).toContain('IBM Plex Mono');
  });

  it('renders compact 10x24 padding by default for the top-strip use case', () => {
    const { container } = render(<FieldGuideDarkBand>X</FieldGuideDarkBand>);
    const band = container.querySelector('.fg-dark-band') as HTMLElement;
    expect(band.style.padding).toBe('10px 24px');
  });

  it('honors paddingY and paddingX overrides', () => {
    const { container } = render(
      <FieldGuideDarkBand paddingY={64} paddingX={32}>
        FINAL
      </FieldGuideDarkBand>
    );
    const band = container.querySelector('.fg-dark-band') as HTMLElement;
    expect(band.style.padding).toBe('64px 32px');
  });

  it('renders as a section element when as="section"', () => {
    const { container } = render(
      <FieldGuideDarkBand as="section">SECTIONED</FieldGuideDarkBand>
    );
    expect(container.querySelector('section.fg-dark-band')).not.toBeNull();
  });

  it('renders as a footer element when as="footer"', () => {
    const { container } = render(<FieldGuideDarkBand as="footer">FOOT</FieldGuideDarkBand>);
    expect(container.querySelector('footer.fg-dark-band')).not.toBeNull();
  });

  it('does not emit italic styles', () => {
    const { container } = render(<FieldGuideDarkBand>NO ITAL</FieldGuideDarkBand>);
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });
});
