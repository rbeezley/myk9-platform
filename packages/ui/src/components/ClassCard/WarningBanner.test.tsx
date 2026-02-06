import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WarningBanner, type WarningBannerVariant } from './WarningBanner';

describe('WarningBanner', () => {
  it('should render with message', () => {
    render(<WarningBanner message="Offline - updates when reconnected" />);
    expect(screen.getByText('Offline - updates when reconnected')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    render(
      <WarningBanner
        message="Test"
        icon={<span data-testid="icon">!</span>}
      />
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('should not render icon container when icon is not provided', () => {
    const { container } = render(<WarningBanner message="Test" />);
    const spans = container.querySelectorAll('span.flex-shrink-0');
    expect(spans.length).toBe(0);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <WarningBanner message="Test" className="custom-warning" />
    );
    expect(container.firstElementChild?.className).toContain('custom-warning');
  });

  describe('variants', () => {
    it.each([
      'offline',
      'stale',
      'warning',
      'info',
    ] as WarningBannerVariant[])('should render %s variant', (variant) => {
      render(<WarningBanner message={`${variant} message`} variant={variant} />);
      expect(screen.getByText(`${variant} message`)).toBeInTheDocument();
    });

    it('should default to warning variant', () => {
      const { container } = render(<WarningBanner message="Default" />);
      const el = container.firstElementChild;
      // Warning variant uses orange classes
      expect(el?.className).toContain('orange');
    });
  });
});
