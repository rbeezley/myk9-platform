import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MonogramHeading } from '../components/MonogramHeading';
import { monogramColors } from '../tokens';

describe('MonogramHeading', () => {
  it('renders the requested heading level', () => {
    const { container } = render(<MonogramHeading level={2}>Hello</MonogramHeading>);
    expect(container.querySelector('h2')).not.toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Hello');
  });

  it('renders <h1> for level=1 and <h4> for level=4', () => {
    const { container: c1 } = render(<MonogramHeading level={1}>One</MonogramHeading>);
    expect(c1.querySelector('h1')).not.toBeNull();

    const { container: c4 } = render(<MonogramHeading level={4}>Four</MonogramHeading>);
    expect(c4.querySelector('h4')).not.toBeNull();
  });

  it('applies italic + bronze coloring when italic prop is true', () => {
    const { container } = render(
      <MonogramHeading level={2} italic>
        Italic title
      </MonogramHeading>
    );
    const h = container.querySelector('h2')!;
    expect(h.style.fontStyle).toBe('italic');
    expect(h.style.color).toBe('rgb(138, 105, 56)'); // bronze
  });

  it('uses ink color (not italic) by default', () => {
    const { container } = render(<MonogramHeading level={2}>Default</MonogramHeading>);
    const h = container.querySelector('h2')!;
    expect(h.style.fontStyle).toBe('normal');
    expect(h.style.color).toBe('rgb(28, 24, 21)'); // ink
  });

  it('honors custom size override', () => {
    const { container } = render(
      <MonogramHeading level={2} size={120}>
        Big
      </MonogramHeading>
    );
    expect(container.querySelector('h2')?.style.fontSize).toBe('120px');
  });

  it('falls back to level-default size when no size is given', () => {
    const { container } = render(<MonogramHeading level={3}>H3</MonogramHeading>);
    expect(container.querySelector('h3')?.style.fontSize).toBe('28px');
  });

  it('forwards a className without dropping the base mg-heading class', () => {
    const { container } = render(
      <MonogramHeading level={2} className="custom-margin">
        Test
      </MonogramHeading>
    );
    const h = container.querySelector('h2')!;
    expect(h.className).toContain('mg-heading');
    expect(h.className).toContain('custom-margin');
  });

  it('renders child fragments verbatim (no escaping of nested spans)', () => {
    const { container } = render(
      <MonogramHeading level={2}>
        A welcome <span className="italic">to all entrants</span>
      </MonogramHeading>
    );
    expect(container.querySelector('h2 span.italic')?.textContent).toBe('to all entrants');
  });

  // Sanity reference so the token + literal assertions stay aligned.
  it('imported tokens still expose ink and bronze', () => {
    expect(monogramColors.ink).toBe('#1c1815');
    expect(monogramColors.bronze).toBe('#8a6938');
  });
});
