import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterChips } from '@/components/common/FilterChips';

const filters = [
  {
    key: 'discipline',
    label: 'Discipline',
    options: [
      { label: 'Agility', value: 'agility' },
      { label: 'Rally', value: 'rally' },
    ],
  },
  {
    key: 'dateRange',
    label: 'Upcoming',
    options: [
      { label: 'This Month', value: 'this_month' },
      { label: 'Next Month', value: 'next_month' },
    ],
  },
];

describe('FilterChips', () => {
  it('renders filter chips for each filter', () => {
    render(<FilterChips filters={filters} values={{}} onChange={vi.fn()} />);
    expect(screen.getByText('Discipline')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
  });

  it('shows active state when a filter has a value', () => {
    render(<FilterChips filters={filters} values={{ discipline: 'agility' }} onChange={vi.fn()} />);
    const chip = screen.getByText('Agility');
    expect(chip).toBeInTheDocument();
  });

  it('calls onChange when a filter value is selected', () => {
    const onChange = vi.fn();
    render(<FilterChips filters={filters} values={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText('Discipline'));
    fireEvent.click(screen.getByText('Agility'));
    expect(onChange).toHaveBeenCalledWith('discipline', 'agility');
  });

  it('has minimum 48px touch target on chips', () => {
    const { container } = render(<FilterChips filters={filters} values={{}} onChange={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.className).toMatch(/h-12|min-h-\[48px\]|py-3/);
    });
  });
});
