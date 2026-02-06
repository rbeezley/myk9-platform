import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import { badgeVariants } from './badgeVariants';

describe('Badge', () => {
  it('should render with children', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(<Badge className="custom">Test</Badge>);
    expect(screen.getByText('Test').className).toContain('custom');
  });

  it('should pass through HTML attributes', () => {
    render(<Badge data-testid="badge" aria-label="status">Label</Badge>);
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveAttribute('aria-label', 'status');
  });

  describe('variants', () => {
    it.each([
      'default',
      'secondary',
      'destructive',
      'outline',
      'success',
      'warning',
      'pending',
      'approved',
      'rejected',
      'draft',
    ] as const)('should render %s variant', (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
    });
  });
});

describe('badgeVariants', () => {
  it('should return a class string with defaults', () => {
    const result = badgeVariants();
    expect(typeof result).toBe('string');
    expect(result).toContain('inline-flex');
  });

  it('should produce different classes for different variants', () => {
    const defaultClasses = badgeVariants({ variant: 'default' });
    const destructiveClasses = badgeVariants({ variant: 'destructive' });
    expect(defaultClasses).not.toBe(destructiveClasses);
  });
});
