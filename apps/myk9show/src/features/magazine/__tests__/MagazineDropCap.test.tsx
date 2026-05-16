import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineDropCap } from '../components/MagazineDropCap';

describe('MagazineDropCap', () => {
  it('returns null when children is an empty string', () => {
    const { container } = render(<MagazineDropCap>{''}</MagazineDropCap>);
    expect(container.firstChild).toBeNull();
  });

  it('floats the first character as the drop cap', () => {
    const { container } = render(<MagazineDropCap>For seventy-nine years</MagazineDropCap>);
    const dropCap = container.querySelector('.mz-drop-cap');
    expect(dropCap).toBeInTheDocument();
    expect(dropCap?.textContent).toBe('F');
  });

  it('aria-hides the drop cap to avoid screen-reader double-reads', () => {
    const { container } = render(<MagazineDropCap>For seventy-nine years</MagazineDropCap>);
    expect(container.querySelector('.mz-drop-cap')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the rest of the paragraph after the drop cap', () => {
    const { container } = render(<MagazineDropCap>For seventy-nine years</MagazineDropCap>);
    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toContain('or seventy-nine years');
  });

  it('mirrors the first letter in a sr-only span for screen readers', () => {
    const { container } = render(<MagazineDropCap>For seventy-nine years</MagazineDropCap>);
    expect(container.querySelector('.sr-only')).toHaveTextContent('F');
  });

  it('renders just the lone letter when the paragraph is a single character', () => {
    const { container } = render(<MagazineDropCap>A</MagazineDropCap>);
    expect(container.querySelector('.mz-drop-cap')).toHaveTextContent('A');
  });

  it('passes through a custom className to the host paragraph', () => {
    const { container } = render(
      <MagazineDropCap className="text-lg">Welcome to the trial.</MagazineDropCap>
    );
    expect(container.querySelector('p')).toHaveClass('text-lg');
  });
});
