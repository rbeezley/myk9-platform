import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HeritageOrnamentRule } from '../components/HeritageOrnamentRule';

describe('HeritageOrnamentRule', () => {
  beforeEach(() => {
    // jsdom lacks IntersectionObserver; the hook falls back to "revealed: true"
    // when missing, which is the behavior we want under test anyway.
    vi.stubGlobal('IntersectionObserver', undefined);
  });

  it('renders two line segments and the diamond glyph', () => {
    const { container } = render(<HeritageOrnamentRule />);
    expect(container.querySelectorAll('.l')).toHaveLength(2);
    expect(container.querySelector('.di')?.textContent).toBe('✦');
  });

  it('applies the gold modifier when variant=gold', () => {
    const { container } = render(<HeritageOrnamentRule variant="gold" />);
    expect(container.firstChild).toHaveClass('gold');
  });

  it('omits the gold modifier when variant=ink (default)', () => {
    const { container } = render(<HeritageOrnamentRule />);
    expect(container.firstChild).not.toHaveClass('gold');
  });

  it('marks the rule aria-hidden by default since it is decorative', () => {
    const { container } = render(<HeritageOrnamentRule />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes through a custom className', () => {
    const { container } = render(<HeritageOrnamentRule className="extra" />);
    expect(container.firstChild).toHaveClass('extra');
  });
});
