import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ViewToggle } from '@/components/common/ViewToggle';

describe('ViewToggle', () => {
  const modes = [
    { key: 'cards', label: 'Cards', icon: 'grid' as const },
    { key: 'table', label: 'Table', icon: 'table' as const },
  ];

  it('renders all view mode buttons with title attributes', () => {
    render(<ViewToggle modes={modes} active="cards" onChange={vi.fn()} />);
    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('highlights the active mode', () => {
    render(<ViewToggle modes={modes} active="cards" onChange={vi.fn()} />);
    const cardsBtn = screen.getByTitle('Cards view');
    expect(cardsBtn.className).toMatch(/bg-primary/);
  });

  it('calls onChange when a different mode is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle modes={modes} active="cards" onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Table view'));
    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('does not render when only one mode', () => {
    const { container } = render(
      <ViewToggle modes={[modes[0]]} active="cards" onChange={vi.fn()} />
    );
    expect(container.firstElementChild).toBeNull();
  });
});
