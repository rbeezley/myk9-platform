import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RunOrderDialog } from '../RunOrderDialog';
import type { RunOrderEntry } from '@/lib/runOrderUtils';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  entries: [] as RunOrderEntry[],
  onApply: vi.fn().mockResolvedValue(undefined),
};

describe('RunOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onApply.mockResolvedValue(undefined);
  });

  it('renders all 4 preset options', () => {
    render(<RunOrderDialog {...defaultProps} />);
    expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
    expect(screen.getByText('Armband High to Low')).toBeInTheDocument();
    expect(screen.getByText('Random Shuffle')).toBeInTheDocument();
    expect(screen.getByText('Manual Drag and Drop')).toBeInTheDocument();
  });

  it('Apply button is disabled when nothing is selected', () => {
    render(<RunOrderDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('Apply button is enabled after selecting a preset', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('calls onApply with armband-asc when that preset is selected', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(defaultProps.onApply).toHaveBeenCalledWith('armband-asc', 'all');
  });

  it('calls onApply with manual when Manual Drag and Drop is selected', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Manual Drag and Drop'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(defaultProps.onApply).toHaveBeenCalledWith('manual', 'all');
  });

  it('calls onOpenChange(false) after successful apply', async () => {
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Random Shuffle'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows Applying... text and disables buttons while applying', async () => {
    defaultProps.onApply.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 200)));
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // Drain the pending timer before the test ends to prevent leaking state into the next test
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled(), {
      timeout: 500,
    });
  });

  it('stays open and re-enables Apply when onApply throws', async () => {
    defaultProps.onApply.mockRejectedValue(new Error('network error'));
    const { user } = render(<RunOrderDialog {...defaultProps} />);
    await user.click(screen.getByText('Armband Low to High'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled());
    expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('displays the entry count in the description', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, armband: String(i + 1) }));
    render(<RunOrderDialog {...defaultProps} entries={entries} />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<RunOrderDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Set Run Order')).not.toBeInTheDocument();
  });
});
