import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { Input } from './Input';

describe('Input', () => {
  it('should render an input element', () => {
    render(<Input aria-label="test input" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('should apply placeholder', () => {
    render(<Input placeholder="Enter name..." />);
    expect(screen.getByPlaceholderText('Enter name...')).toBeInTheDocument();
  });

  it('should apply type attribute', () => {
    render(<Input type="email" aria-label="email" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('should handle value changes', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="name" />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');
  });

  it('should be disabled when disabled prop is set', () => {
    render(<Input disabled aria-label="disabled" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('should apply custom className', () => {
    render(<Input className="custom-input" aria-label="test" />);
    expect(screen.getByRole('textbox').className).toContain('custom-input');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="test" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('should have displayName', () => {
    expect(Input.displayName).toBe('Input');
  });

  it('should pass through aria attributes', () => {
    render(<Input aria-label="Name" aria-required="true" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-label', 'Name');
    expect(input).toHaveAttribute('aria-required', 'true');
  });
});
