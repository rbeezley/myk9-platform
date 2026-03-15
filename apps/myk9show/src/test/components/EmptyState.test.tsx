import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Search } from 'lucide-react';

// Mock PremiumButton to avoid @myk9/ui resolution issue
vi.mock('@/components/common/PremiumButton', () => ({
  PremiumButton: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

// Mock IconContainer
vi.mock('@/components/common/IconContainer', () => ({
  IconContainer: () => <div data-testid="icon-container" />,
}));

import { EmptyState } from '@/components/common/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState icon={Search} title="No shows found" />);
    expect(screen.getByText('No shows found')).toBeInTheDocument();
  });

  it('renders CTA button when action provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={Search} title="No shows" action={{ label: 'Browse Shows', onClick }} />,
    );
    fireEvent.click(screen.getByText('Browse Shows'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState icon={Search} title="No shows" description="Try adjusting your filters" />,
    );
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });
});
