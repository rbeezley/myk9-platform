import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('should render with label', () => {
    render(<StatusBadge label="Checked In" />);
    expect(screen.getByText('Checked In')).toBeInTheDocument();
  });

  it('should render as a div by default', () => {
    const { container } = render(<StatusBadge label="Status" data-testid="badge" />);
    const badge = container.firstElementChild;
    expect(badge?.tagName).toBe('DIV');
  });

  it('should render as a button when asButton is true', () => {
    render(<StatusBadge label="Click me" asButton />);
    expect(screen.getByRole('button', { name: /Click me/ })).toBeInTheDocument();
  });

  it('should render as a button when clickable and onClick are set', () => {
    render(<StatusBadge label="Click me" clickable onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /Click me/ })).toBeInTheDocument();
  });

  it('should display time when provided', () => {
    render(<StatusBadge label="Briefing" time="2:30 PM" />);
    expect(screen.getByText('2:30 PM')).toBeInTheDocument();
  });

  it('should not display time when null', () => {
    render(<StatusBadge label="Briefing" time={null} />);
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('should display icon when provided', () => {
    render(<StatusBadge label="Status" icon={<span data-testid="icon">*</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('should handle click events on button variant', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatusBadge label="Click" asButton onClick={handleClick} />);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should apply custom className', () => {
    const { container } = render(<StatusBadge label="Test" className="custom-badge" />);
    expect(container.firstElementChild?.className).toContain('custom-badge');
  });

  it('should forward ref', () => {
    const ref = React.createRef<HTMLElement>();
    render(<StatusBadge ref={ref} label="Test" />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it('should have displayName', () => {
    expect(StatusBadge.displayName).toBe('StatusBadge');
  });

  describe('variants', () => {
    it.each([
      'default',
      'muted',
      'checked-in',
      'at-gate',
      'in-ring',
      'scored',
      'conflict',
      'pulled',
      'setup',
      'briefing',
      'break',
      'in-progress',
      'completed',
      'qualified',
      'not-qualified',
      'excused',
      'absent',
      'success',
      'warning',
      'error',
      'info',
    ] as const)('should render %s variant', (variant) => {
      render(<StatusBadge label={variant} variant={variant} />);
      expect(screen.getByText(variant)).toBeInTheDocument();
    });
  });

  describe('sizes', () => {
    it.each(['sm', 'default', 'lg'] as const)('should render %s size', (size) => {
      render(<StatusBadge label="Test" size={size} />);
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });
});
