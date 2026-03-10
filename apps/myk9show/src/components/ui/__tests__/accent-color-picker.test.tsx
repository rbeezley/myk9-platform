import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccentColorPicker } from '../accent-color-picker';

describe('AccentColorPicker', () => {
  it('renders all 10 preset swatches plus None option', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(11);
  });

  it('marks the selected color as checked', () => {
    render(<AccentColorPicker value="#2563eb" onChange={vi.fn()} />);
    const selected = screen.getByRole('radio', { name: /blue/i });
    expect(selected).toHaveAttribute('aria-checked', 'true');
  });

  it('marks None as checked when value is null', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    const none = screen.getByRole('radio', { name: /none/i });
    expect(none).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with hex when a swatch is clicked', async () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /red/i }));
    expect(onChange).toHaveBeenCalledWith('#dc2626');
  });

  it('calls onChange with null when None is clicked', async () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value="#2563eb" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /none/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders a preview strip when a color is selected', () => {
    render(<AccentColorPicker value="#2563eb" onChange={vi.fn()} />);
    expect(screen.getByTestId('color-preview')).toBeInTheDocument();
  });

  it('does not render preview strip when None is selected', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId('color-preview')).not.toBeInTheDocument();
  });
});
