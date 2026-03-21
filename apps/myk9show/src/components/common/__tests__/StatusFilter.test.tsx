import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusFilter } from '../StatusFilter';

describe('StatusFilter', () => {
  const defaultProps = {
    filter: 'all' as const,
    onFilterChange: vi.fn(),
    counts: { all: 10, pending: 7, completed: 3 },
  };

  it('renders three segments with counts', () => {
    render(<StatusFilter {...defaultProps} />);
    // "All" has the same desktop/mobile label, so both spans match — use getAllByText
    expect(screen.getAllByText('All (10)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pending (7)')).toBeInTheDocument();
    expect(screen.getByText('Completed (3)')).toBeInTheDocument();
  });

  it('highlights the active segment', () => {
    render(<StatusFilter {...defaultProps} filter="pending" />);
    const pendingBtn = screen.getByText('Pending (7)').closest('button')!;
    expect(pendingBtn.className).toContain('bg-background');
  });

  it('calls onFilterChange when a segment is clicked', async () => {
    const onFilterChange = vi.fn();
    render(<StatusFilter {...defaultProps} onFilterChange={onFilterChange} />);
    await userEvent.click(screen.getByText('Completed (3)'));
    expect(onFilterChange).toHaveBeenCalledWith('completed');
  });

  it('returns null when all items are pending', () => {
    const { container } = render(
      <StatusFilter {...defaultProps} counts={{ all: 10, pending: 10, completed: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when all items are completed', () => {
    const { container } = render(
      <StatusFilter {...defaultProps} counts={{ all: 10, pending: 0, completed: 10 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when there is a mix of statuses', () => {
    render(<StatusFilter {...defaultProps} />);
    expect(screen.getAllByText('All (10)').length).toBeGreaterThanOrEqual(1);
  });
});
