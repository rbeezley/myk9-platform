import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SeeClassesLink } from '../SeeClassesLink';

describe('SeeClassesLink', () => {
  it('links to the provided public classes URL', () => {
    render(<SeeClassesLink href="/shows/show-1/trials/trial-1" />);
    const link = screen.getByTestId('see-classes-link');
    expect(link).toHaveAttribute('href', '/shows/show-1/trials/trial-1');
    expect(link).toHaveTextContent(/see classes/i);
  });

  it('inherits color so it blends into each bespoke landing theme', () => {
    render(<SeeClassesLink href="/shows/show-1/trials/trial-1" />);
    // jsdom resolves currentColor in computed style, so assert on the raw inline value.
    expect(screen.getByTestId('see-classes-link').style.color).toMatch(/currentcolor/i);
  });

  it('clears the 44px touch floor by default on every themed landing', () => {
    render(<SeeClassesLink href="/shows/show-1/trials/trial-1" />);
    const link = screen.getByTestId('see-classes-link');
    expect(link.style.minHeight).toBe('44px');
    expect(link.style.display).toBe('inline-flex');
    expect(link.style.alignItems).toBe('center');
  });

  it('still lets a caller override styles (defaults precede the spread)', () => {
    render(
      <SeeClassesLink href="/shows/show-1/trials/trial-1" style={{ color: 'rgb(1, 2, 3)' }} />
    );
    const link = screen.getByTestId('see-classes-link');
    // caller override wins…
    expect(link.style.color).toBe('rgb(1, 2, 3)');
    // …without dropping the tap-target default
    expect(link.style.minHeight).toBe('44px');
  });

  it('renders nothing when there is no href (e.g. show has no trials)', () => {
    const { container } = render(<SeeClassesLink href={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('supports a custom label', () => {
    render(<SeeClassesLink href="/shows/show-1/trials/trial-1" label="Preview classes" />);
    expect(screen.getByTestId('see-classes-link')).toHaveTextContent('Preview classes');
  });
});
