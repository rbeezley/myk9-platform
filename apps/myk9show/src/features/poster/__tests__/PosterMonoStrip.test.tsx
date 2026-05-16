import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PosterMonoStrip } from '../components/PosterMonoStrip';

describe('PosterMonoStrip', () => {
  it('renders all items in left-to-right order', () => {
    const { container } = render(
      <PosterMonoStrip
        items={[
          { label: 'SS‒26' },
          { label: '12—14 JUN' },
          { label: 'LIVE OAK' },
        ]}
      />
    );
    expect(container.textContent).toContain('SS‒26');
    expect(container.textContent).toContain('12—14 JUN');
    expect(container.textContent).toContain('LIVE OAK');
  });

  it('renders bullet separators between items but not before the first', () => {
    const { container } = render(
      <PosterMonoStrip items={[{ label: 'A' }, { label: 'B' }, { label: 'C' }]} />
    );
    const bullets = container.querySelectorAll('span[aria-hidden]');
    // Two separators for three items.
    expect(bullets.length).toBe(2);
    bullets.forEach(b => expect(b.textContent).toBe('●'));
  });

  it('renders a CTA chip with the supplied href', () => {
    const { container } = render(
      <PosterMonoStrip items={[{ label: 'A' }]} cta={{ label: 'ENTER →', href: '/r/123' }} />
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/r/123');
    expect(link?.textContent).toBe('ENTER →');
  });

  it('omits the CTA chip when cta is not supplied', () => {
    const { container } = render(<PosterMonoStrip items={[{ label: 'A' }]} />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('uses ink background and cream foreground by default', () => {
    const { container } = render(<PosterMonoStrip items={[{ label: 'A' }]} />);
    const strip = container.querySelector('.po-strip') as HTMLElement;
    expect(strip.style.background).toBe('rgb(31, 29, 24)');
    expect(strip.style.color).toBe('rgb(243, 237, 224)');
  });

  it('applies the tracked-tight 0.04em letter-spacing (NOT 0.32em)', () => {
    const { container } = render(<PosterMonoStrip items={[{ label: 'A' }]} />);
    const strip = container.querySelector('.po-strip') as HTMLElement;
    expect(strip.style.letterSpacing).toBe('0.04em');
  });

  it('applies the hide-narrow class to items past the second', () => {
    const { container } = render(
      <PosterMonoStrip
        items={[{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }]}
      />
    );
    const items = container.querySelectorAll('.po-strip-item');
    expect(items[0]?.className).not.toContain('hide-narrow');
    expect(items[1]?.className).not.toContain('hide-narrow');
    expect(items[2]?.className).toContain('po-strip-item--hide-narrow');
    expect(items[3]?.className).toContain('po-strip-item--hide-narrow');
  });
});
