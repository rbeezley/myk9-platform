import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DetailHero } from '@/components/common/DetailHero';

describe('DetailHero', () => {
  it('renders entity name', () => {
    render(<DetailHero name="Bluegrass Classic Agility Trial" />);
    expect(screen.getByText('Bluegrass Classic Agility Trial')).toBeInTheDocument();
  });

  it('renders metadata items', () => {
    render(
      <DetailHero
        name="Test Show"
        metadata={[
          { label: 'Mar 22-23, 2026' },
          { label: 'Louisville, KY' },
          { label: 'Bluegrass KC' },
        ]}
      />
    );
    expect(screen.getByText('Mar 22-23, 2026')).toBeInTheDocument();
    expect(screen.getByText('Louisville, KY')).toBeInTheDocument();
    expect(screen.getByText('Bluegrass KC')).toBeInTheDocument();
  });

  it('renders badge when provided', () => {
    render(<DetailHero name="Test" badge={{ label: 'Open for Entries', variant: 'success' }} />);
    expect(screen.getByText('Open for Entries')).toBeInTheDocument();
  });

  it('renders primary action button', () => {
    const onAction = vi.fn();
    render(<DetailHero name="Test" primaryAction={{ label: 'Register', onClick: onAction }} />);
    fireEvent.click(screen.getByText('Register'));
    expect(onAction).toHaveBeenCalled();
  });

  it('primary action button has 48px touch target', () => {
    render(<DetailHero name="Test" primaryAction={{ label: 'Register', onClick: vi.fn() }} />);
    const btn = screen.getByText('Register').closest('button');
    expect(btn?.className).toMatch(/h-12|min-h-\[48px\]/);
  });
});
