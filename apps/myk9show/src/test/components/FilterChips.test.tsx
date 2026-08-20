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

  it('renders chips at the 44px touch floor', () => {
    // Reverses an earlier decision to render these at h-8/32px as "secondary,
    // not primary" controls. docs/INTENT.md sets a 44px floor for every tap
    // target, not only primary actions, because the audience is largely older
    // users working on tablets outdoors — and a filter chip is a tap target. A
    // live audit measured these at 86x32 and 68x32.
    const { container } = render(<FilterChips filters={filters} values={{}} onChange={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.className).toMatch(/h-11/);
    });
  });

  it('offers a keyboard-reachable reset once a filter is applied', () => {
    // Regression guard: the clear control used to be a bare <X> SVG inside the
    // dropdown trigger, so at >=640px an applied filter could not be removed by
    // keyboard at all.
    const onChange = vi.fn();
    render(
      <FilterChips filters={filters} values={{ discipline: 'agility' }} onChange={onChange} />
    );

    const clear = screen.getByRole('button', { name: /clear discipline filter/i });
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith('discipline', null);
  });

  it('explains an empty option list instead of opening a blank menu', () => {
    render(
      <FilterChips
        filters={[{ key: 'breed', label: 'Breed', options: [] }]}
        values={{}}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Breed'));
    expect(screen.getByText('No breed options yet')).toBeInTheDocument();
  });
});
