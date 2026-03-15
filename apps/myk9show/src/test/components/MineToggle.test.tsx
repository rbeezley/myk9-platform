import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MineToggle } from '@/components/common/MineToggle';

describe('MineToggle', () => {
  it('renders All and Mine labels', () => {
    render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All Shows" mineLabel="My Shows" />
    );
    expect(screen.getByText('All Shows')).toBeInTheDocument();
    expect(screen.getByText('My Shows')).toBeInTheDocument();
  });

  it('highlights the active segment', () => {
    const { rerender } = render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" />
    );
    const allBtn = screen.getByText('All');
    expect(allBtn.closest('button')?.className).toMatch(/bg-/);

    rerender(<MineToggle isMine={true} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" />);
    const mineBtn = screen.getByText('Mine');
    expect(mineBtn.closest('button')?.className).toMatch(/bg-/);
  });

  it('calls onToggle when clicking the inactive segment', () => {
    const onToggle = vi.fn();
    render(<MineToggle isMine={false} onToggle={onToggle} allLabel="All" mineLabel="Mine" />);
    fireEvent.click(screen.getByText('Mine'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows counts when provided', () => {
    render(
      <MineToggle
        isMine={false}
        onToggle={vi.fn()}
        allLabel="All Classes"
        mineLabel="My Classes"
        allCount={48}
        mineCount={6}
      />
    );
    expect(screen.getByText('All Classes (48)')).toBeInTheDocument();
    expect(screen.getByText('My Classes (6)')).toBeInTheDocument();
  });

  it('is hidden when hidden prop is true', () => {
    const { container } = render(
      <MineToggle isMine={false} onToggle={vi.fn()} allLabel="All" mineLabel="Mine" hidden={true} />
    );
    expect(container.firstElementChild).toBeNull();
  });
});
