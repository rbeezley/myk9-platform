import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MagazineGoldRule } from '../components/MagazineGoldRule';

describe('MagazineGoldRule', () => {
  it('renders a div with the .mz-gold-rule class', () => {
    const { container } = render(<MagazineGoldRule />);
    const rule = container.firstChild as HTMLElement;
    expect(rule.tagName).toBe('DIV');
    expect(rule).toHaveClass('mz-gold-rule');
  });

  it('adds the --thick modifier when thick prop is set', () => {
    const { container } = render(<MagazineGoldRule thick />);
    expect(container.firstChild).toHaveClass('mz-gold-rule--thick');
  });

  it('omits the --thick modifier by default', () => {
    const { container } = render(<MagazineGoldRule />);
    expect(container.firstChild).not.toHaveClass('mz-gold-rule--thick');
  });

  it('uses role=presentation by default with aria-hidden', () => {
    const { container } = render(<MagazineGoldRule />);
    expect(container.firstChild).toHaveAttribute('role', 'presentation');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('allows role=separator when used as a meaningful divider', () => {
    const { container } = render(<MagazineGoldRule role="separator" />);
    expect(container.firstChild).toHaveAttribute('role', 'separator');
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'false');
  });

  it('passes through a custom className', () => {
    const { container } = render(<MagazineGoldRule className="my-8" />);
    expect(container.firstChild).toHaveClass('mz-gold-rule', 'my-8');
  });
});
