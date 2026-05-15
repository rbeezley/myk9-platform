import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BannerFlagBar } from '../components/BannerFlagBar';

describe('BannerFlagBar', () => {
  it('renders children inside the bar', () => {
    const { getByText } = render(
      <BannerFlagBar variant="masthead" color="#0d4d4f" textColor="#ffffff">
        Hello banner
      </BannerFlagBar>
    );
    expect(getByText('Hello banner')).toBeInTheDocument();
  });

  it('paints the masthead background with the supplied flag color', () => {
    const { container } = render(
      <BannerFlagBar variant="masthead" color="#1a4d80" textColor="#ffffff">
        x
      </BannerFlagBar>
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.background).toBe('rgb(26, 77, 128)');
  });

  it('uses the deeper sibling on the final variant when provided', () => {
    const { container } = render(
      <BannerFlagBar
        variant="final"
        color="#1a4d80"
        colorDeep="#0d2540"
        textColor="#ffffff"
      >
        final
      </BannerFlagBar>
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.background).toBe('rgb(13, 37, 64)');
  });

  it('falls back to color when colorDeep is omitted on final variant', () => {
    const { container } = render(
      <BannerFlagBar variant="final" color="#1a4d80" textColor="#ffffff">
        final
      </BannerFlagBar>
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.background).toBe('rgb(26, 77, 128)');
  });

  it('applies the supplied textColor', () => {
    const { container } = render(
      <BannerFlagBar variant="masthead" color="#fafaaa" textColor="#111111">
        x
      </BannerFlagBar>
    );
    const section = container.querySelector('section') as HTMLElement;
    expect(section.style.color).toBe('rgb(17, 17, 17)');
  });

  it('marks the section with a variant-specific class', () => {
    const { container: m } = render(
      <BannerFlagBar variant="masthead" color="#0d4d4f" textColor="#ffffff">
        x
      </BannerFlagBar>
    );
    expect(m.querySelector('.bn-flag--masthead')).not.toBeNull();
    expect(m.querySelector('.bn-flag--final')).toBeNull();

    const { container: f } = render(
      <BannerFlagBar variant="final" color="#0d4d4f" textColor="#ffffff">
        x
      </BannerFlagBar>
    );
    expect(f.querySelector('.bn-flag--final')).not.toBeNull();
    expect(f.querySelector('.bn-flag--masthead')).toBeNull();
  });
});
