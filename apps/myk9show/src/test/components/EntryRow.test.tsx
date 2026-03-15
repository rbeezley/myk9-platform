import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EntryRow } from '@/components/live/EntryRow';

describe('EntryRow', () => {
  const baseProps = {
    armband: '148',
    dogName: 'Bella',
    breed: 'Aussie',
    handlerName: 'Sarah Johnson',
    status: 'checked_in' as const,
  };

  it('renders armband number prominently', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('#148')).toBeInTheDocument();
  });

  it('renders dog name and handler', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<EntryRow {...baseProps} />);
    expect(screen.getByText('Checked In')).toBeInTheDocument();
  });

  it('shows "YOU" badge when isCurrentUser is true', () => {
    render(<EntryRow {...baseProps} isCurrentUser />);
    expect(screen.getByText('YOU')).toBeInTheDocument();
  });

  it('applies orange border when isCurrentUser is true', () => {
    const { container } = render(<EntryRow {...baseProps} isCurrentUser />);
    expect(container.firstElementChild?.className).toContain('border-l-orange');
  });

  it('applies blue highlight when status is in_ring', () => {
    const { container } = render(<EntryRow {...baseProps} status="in_ring" />);
    expect(container.firstElementChild?.className).toContain('border-l-primary');
  });

  it('renders result when provided', () => {
    render(<EntryRow {...baseProps} status="completed" result="Q" time="42.3s" />);
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('42.3s')).toBeInTheDocument();
  });
});
