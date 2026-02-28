import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Button } from './Button';
import { buttonVariants } from './buttonVariants';

describe('Button', () => {
  it('should render with default props', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('should render as a button element by default', () => {
    render(<Button>Test</Button>);
    const button = screen.getByRole('button');
    expect(button.tagName).toBe('BUTTON');
  });

  it('should apply custom className', () => {
    render(<Button className="custom-class">Test</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('should handle click events', async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(
      <Button
        onClick={() => {
          clicked = true;
        }}
      >
        Click
      </Button>
    );
    await user.click(screen.getByRole('button'));
    expect(clicked).toBe(true);
  });

  it('should be disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should have displayName', () => {
    expect(Button.displayName).toBe('Button');
  });

  it('should pass through HTML button attributes', () => {
    render(
      <Button type="submit" aria-label="Submit form">
        Submit
      </Button>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('aria-label', 'Submit form');
  });

  describe('variants', () => {
    it.each(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] as const)(
      'should render %s variant',
      variant => {
        render(<Button variant={variant}>Variant</Button>);
        expect(screen.getByRole('button')).toBeInTheDocument();
      }
    );
  });

  describe('sizes', () => {
    it.each(['default', 'sm', 'lg', 'icon', 'icon-lg'] as const)('should render %s size', size => {
      render(<Button size={size}>Size</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});

describe('buttonVariants', () => {
  it('should return a class string with default variant and size', () => {
    const result = buttonVariants();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should include variant-specific classes', () => {
    const defaultClasses = buttonVariants({ variant: 'default' });
    const destructiveClasses = buttonVariants({ variant: 'destructive' });
    expect(defaultClasses).not.toBe(destructiveClasses);
  });

  it('should include size-specific classes', () => {
    const defaultSize = buttonVariants({ size: 'default' });
    const smSize = buttonVariants({ size: 'sm' });
    expect(defaultSize).not.toBe(smSize);
  });
});
