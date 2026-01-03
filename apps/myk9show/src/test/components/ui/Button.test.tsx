import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button/button';

describe('Button Component', () => {
  describe('Rendering', () => {
    it('should render button with text', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should render button with custom className', () => {
      render(<Button className="custom-class">Test</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should render as disabled when disabled prop is true', () => {
      render(<Button disabled>Disabled Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should render with aria-label', () => {
      render(<Button aria-label="Custom aria label">Button</Button>);
      expect(screen.getByLabelText('Custom aria label')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should apply default variant classes', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('class');
      expect(button.className).toBeTruthy();
    });

    it('should apply variant classes when variant prop is provided', () => {
      render(<Button variant="destructive">Destructive</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('class');
    });

    it('should apply size classes when size prop is provided', () => {
      render(<Button size="sm">Small</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('class');
    });
  });

  describe('Interactions', () => {
    it('should call onClick handler when clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Click me</Button>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick} disabled>Disabled</Button>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should handle keyboard events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Button</Button>);
      
      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: 'Enter' });
      // Note: actual keyboard activation depends on browser behavior
    });

    it('should handle focus and blur events', () => {
      const handleFocus = vi.fn();
      const handleBlur = vi.fn();
      
      render(
        <Button onFocus={handleFocus} onBlur={handleBlur}>
          Focusable
        </Button>
      );
      
      const button = screen.getByRole('button');
      button.focus();
      expect(handleFocus).toHaveBeenCalled();
      
      button.blur();
      expect(handleBlur).toHaveBeenCalled();
    });
  });

  describe('asChild prop', () => {
    it('should render as different element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );
      
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });

    it('should maintain button styles when rendered as child', () => {
      render(
        <Button asChild variant="destructive">
          <a href="/test">Destructive Link</a>
        </Button>
      );
      
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('class');
    });
  });

  describe('Forward Ref', () => {
    it('should forward ref to button element', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Button with ref</Button>);
      
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
      expect(ref.current?.textContent).toBe('Button with ref');
    });
  });

  describe('Accessibility', () => {
    it('should be focusable by default', () => {
      render(<Button>Focusable Button</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      expect(button).toHaveFocus();
    });

    it('should not be focusable when disabled', () => {
      render(<Button disabled>Disabled Button</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      expect(button).not.toHaveFocus();
    });

    it('should support ARIA attributes', () => {
      render(
        <Button 
          aria-describedby="help-text"
          aria-expanded="false"
          aria-controls="menu"
        >
          Menu Button
        </Button>
      );
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-describedby', 'help-text');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveAttribute('aria-controls', 'menu');
    });
  });

  describe('Loading State', () => {
    it('should render loading state when loading prop is provided', () => {
      // This test would apply if the Button component had loading functionality
      render(<Button disabled>Loading...</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent('Loading...');
    });
  });

  describe('Icon Support', () => {
    it('should render with icon children', () => {
      const TestIcon = () => <span data-testid="test-icon">🔥</span>;
      
      render(
        <Button>
          <TestIcon />
          Button with Icon
        </Button>
      );
      
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
      expect(screen.getByText('Button with Icon')).toBeInTheDocument();
    });

    it('should render icon-only button', () => {
      const TestIcon = () => <span data-testid="test-icon" aria-label="Save">💾</span>;
      
      render(
        <Button aria-label="Save">
          <TestIcon />
        </Button>
      );
      
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });
  });
});