import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchBar } from '@/components/common/SearchBar';

describe('SearchBar', () => {
  it('renders with placeholder text', () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search shows..." />);
    expect(screen.getByPlaceholderText('Search shows...')).toBeInTheDocument();
  });

  it('fires onChange when user types', () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} placeholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'agility' } });
    expect(onChange).toHaveBeenCalledWith('agility');
  });

  it('has minimum 48px touch target height', () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} placeholder="Search..." />);
    const input = container.querySelector('input') as HTMLElement;
    expect(input.className).toMatch(/h-12|min-h-\[48px\]/);
  });

  it('shows search icon', () => {
    const { container } = render(<SearchBar value="" onChange={vi.fn()} placeholder="Search..." />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('displays the current value', () => {
    render(<SearchBar value="scent work" onChange={vi.fn()} placeholder="Search..." />);
    expect(screen.getByDisplayValue('scent work')).toBeInTheDocument();
  });

  it('shows clear button when value is non-empty', () => {
    render(<SearchBar value="agility" onChange={vi.fn()} placeholder="Search..." />);
    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('does not show clear button when value is empty', () => {
    render(<SearchBar value="" onChange={vi.fn()} placeholder="Search..." />);
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('calls onChange with empty string when clear button is clicked', () => {
    const onChange = vi.fn();
    render(<SearchBar value="agility" onChange={onChange} placeholder="Search..." />);
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders the compact size at the 44px touch floor', () => {
    // Was h-8/32px. docs/INTENT.md sets a 44px floor for tap targets, and this
    // compact size is the toolbar search on every browse page.
    const { container } = render(
      <SearchBar value="" onChange={vi.fn()} placeholder="Search..." size="sm" />
    );
    const input = container.querySelector('input') as HTMLElement;
    expect(input.className).toMatch(/h-11/);
  });

  it('gives the clear control a full-size hit area, not just the icon box', () => {
    // Regression guard: the clear button used to carry the icon's own h-3.5 w-3.5
    // classes, rendering a 14x14 target.
    render(<SearchBar value="Willow" onChange={vi.fn()} placeholder="Search..." size="sm" />);
    const clear = screen.getByRole('button', { name: /clear search/i });
    expect(clear.className).toMatch(/h-11/);
    expect(clear.className).toMatch(/w-11/);
  });

  it('uses a token placeholder colour rather than the preflight gray', () => {
    // Tailwind preflight paints ::placeholder gray-400, which measured 2.54:1 on
    // white — under the 4.5:1 floor. muted-foreground is 5.91:1.
    const { container } = render(
      <SearchBar value="" onChange={vi.fn()} placeholder="Search..." size="sm" />
    );
    const input = container.querySelector('input') as HTMLElement;
    expect(input.className).toMatch(/placeholder:text-muted-foreground/);
  });
});
