import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FieldGuideHeading } from '../components/FieldGuideHeading';

describe('FieldGuideHeading', () => {
  it('renders an h1 by default at hero size 56px', () => {
    const { container } = render(<FieldGuideHeading>Spring Scent Work Trial</FieldGuideHeading>);
    const heading = container.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toBe('Spring Scent Work Trial');
    expect(heading.style.fontSize).toBe('56px');
  });

  it('renders an h2 at the section size 28px when level=h2', () => {
    const { container } = render(
      <FieldGuideHeading level="h2">Welcome &amp; purpose</FieldGuideHeading>
    );
    const heading = container.querySelector('h2') as HTMLElement;
    expect(heading.style.fontSize).toBe('28px');
  });

  it('renders an h3 at sub-section size 22px when level=h3', () => {
    const { container } = render(<FieldGuideHeading level="h3">Sub-section</FieldGuideHeading>);
    const heading = container.querySelector('h3') as HTMLElement;
    expect(heading.style.fontSize).toBe('22px');
  });

  it('honors the size prop override', () => {
    const { container } = render(
      <FieldGuideHeading level="h1" size={40}>
        Custom
      </FieldGuideHeading>
    );
    const heading = container.querySelector('h1') as HTMLElement;
    expect(heading.style.fontSize).toBe('40px');
  });

  it('uses IBM Plex Sans 700', () => {
    const { container } = render(<FieldGuideHeading>Title</FieldGuideHeading>);
    const heading = container.querySelector('h1') as HTMLElement;
    expect(heading.style.fontFamily).toContain('IBM Plex Sans');
    expect(heading.style.fontWeight).toBe('700');
  });

  it('renders a mono-orange subtitle below the heading when supplied', () => {
    const { container } = render(
      <FieldGuideHeading subtitle="FIELD GUIDE · BCKC.2026.SS · REV 04">
        Spring Scent Work Trial
      </FieldGuideHeading>
    );
    const sub = container.querySelector('h1 > span') as HTMLElement;
    expect(sub.textContent).toBe('FIELD GUIDE · BCKC.2026.SS · REV 04');
    expect(sub.style.fontFamily).toContain('IBM Plex Mono');
    expect(sub.style.color).toBe('rgb(138, 62, 33)');
  });

  it('does not emit any italic styles', () => {
    const { container } = render(<FieldGuideHeading>Title</FieldGuideHeading>);
    expect(container.innerHTML).not.toContain('font-style: italic');
    expect(container.innerHTML).not.toContain('font-style:italic');
  });
});
