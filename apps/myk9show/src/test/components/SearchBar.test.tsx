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

  it('renders compact size with sm prop', () => {
    const { container } = render(
      <SearchBar value="" onChange={vi.fn()} placeholder="Search..." size="sm" />
    );
    const input = container.querySelector('input') as HTMLElement;
    expect(input.className).toMatch(/h-8/);
  });
});
