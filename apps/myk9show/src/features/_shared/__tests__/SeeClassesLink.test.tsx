import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SeeClassesLink } from '../SeeClassesLink';

describe('SeeClassesLink', () => {
  it('links to the registration wizard so classes can be previewed pre-commit', () => {
    render(<SeeClassesLink entryWizardUrl="/shows/abc/register" />);
    const link = screen.getByTestId('see-classes-link');
    expect(link).toHaveAttribute('href', '/shows/abc/register');
    expect(link).toHaveTextContent(/see classes/i);
  });

  it('inherits color so it blends into each bespoke landing theme', () => {
    render(<SeeClassesLink entryWizardUrl="/shows/abc/register" />);
    // jsdom resolves currentColor in computed style, so assert on the raw inline value.
    expect(screen.getByTestId('see-classes-link').style.color).toMatch(/currentcolor/i);
  });

  it('renders nothing when there is no wizard url', () => {
    const { container } = render(<SeeClassesLink entryWizardUrl={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('supports a custom label', () => {
    render(<SeeClassesLink entryWizardUrl="/x" label="Preview classes" />);
    expect(screen.getByTestId('see-classes-link')).toHaveTextContent('Preview classes');
  });
});
