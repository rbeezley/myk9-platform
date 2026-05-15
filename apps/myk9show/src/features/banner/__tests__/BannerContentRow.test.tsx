import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BannerContentRow } from '../components/BannerContentRow';

describe('BannerContentRow', () => {
  it('renders children in the right column', () => {
    const { getByText } = render(
      <BannerContentRow>
        <p>Content</p>
      </BannerContentRow>
    );
    expect(getByText('Content')).toBeInTheDocument();
  });

  it('renders an empty aria-hidden left column for the 240px folio offset', () => {
    const { container } = render(
      <BannerContentRow>
        <p>Content</p>
      </BannerContentRow>
    );
    const leftCol = container.querySelector('.bn-content-row > [aria-hidden]');
    expect(leftCol).not.toBeNull();
    expect(leftCol?.textContent).toBe('');
  });

  it('applies a 240px / 1fr grid via inline style', () => {
    const { container } = render(
      <BannerContentRow>
        <p>x</p>
      </BannerContentRow>
    );
    const row = container.querySelector('.bn-content-row') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('240px 1fr');
    expect(row.style.display).toBe('grid');
  });

  it('forwards className without dropping the base class', () => {
    const { container } = render(
      <BannerContentRow className="custom-margin">
        <p>x</p>
      </BannerContentRow>
    );
    const row = container.querySelector('.bn-content-row') as HTMLElement;
    expect(row.className).toContain('bn-content-row');
    expect(row.className).toContain('custom-margin');
  });
});
