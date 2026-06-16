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

  it('renders nothing when there is no href (e.g. show has no trials)', () => {
    const { container } = render(<SeeClassesLink href={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('supports a custom label', () => {
    render(<SeeClassesLink href="/shows/show-1/trials/trial-1" label="Preview classes" />);
    expect(screen.getByTestId('see-classes-link')).toHaveTextContent('Preview classes');
  });
});
