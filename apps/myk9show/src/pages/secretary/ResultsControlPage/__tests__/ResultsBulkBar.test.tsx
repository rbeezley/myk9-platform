import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ResultsBulkBar } from '../ResultsBulkBar';
import { markServerUnreachable, resetServerReachabilityForTests } from '@/lib/serverReachability';

const mockBulkMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useBulkUpdateClassOverrides: () => ({ mutate: mockBulkMutate, isPending: false }),
}));

const mockNetworkState = vi.hoisted(() => ({ isOnline: true }));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkState,
}));

function renderBar(overrides: Partial<React.ComponentProps<typeof ResultsBulkBar>> = {}) {
  const props: React.ComponentProps<typeof ResultsBulkBar> = {
    showId: 'show-1',
    selectedClasses: new Set(['a', 'b']),
    allClassIds: ['a', 'b', 'c'],
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    ...overrides,
  };
  return render(<ResultsBulkBar {...props} />);
}

describe('ResultsBulkBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNetworkState.isOnline = true;
    resetServerReachabilityForTests();
  });

  it('renders nothing when no classes are selected', () => {
    const { container } = renderBar({ selectedClasses: new Set() });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selection count on the shared floating toolbar', () => {
    renderBar();
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument();
    expect(screen.getByText('2 classes selected')).toBeInTheDocument();
  });

  it('keeps "Select All (M)" and calls onSelectAll', async () => {
    const onSelectAll = vi.fn();
    const { user } = renderBar({ onSelectAll });
    await user.click(screen.getByRole('button', { name: 'Select All (3)' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('the shared bar Clear control calls onClearSelection', async () => {
    const onClearSelection = vi.fn();
    const { user } = renderBar({ onClearSelection });
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  describe('Apply Preset', () => {
    it('applies the selected preset to the selection with the same payload', async () => {
      const { user } = renderBar();

      await user.click(screen.getByRole('combobox'));
      // Base UI pre-mounts hidden items on focus before the popup opens.
      // Text presence is not readiness; wait for the exposed option.
      const option = await screen.findByRole('option', { name: 'Immediately' });
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
      await user.click(option);

      expect(mockBulkMutate).toHaveBeenCalledTimes(1);
      expect(mockBulkMutate.mock.calls[0][0]).toEqual(
        expect.objectContaining({ classIds: ['a', 'b'], showId: 'show-1', preset: 'open' })
      );
    });

    it('toasts success and clears the selection on a successful preset apply', async () => {
      mockBulkMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
      const onClearSelection = vi.fn();
      const { user } = renderBar({ onClearSelection });

      await user.click(screen.getByRole('combobox'));
      const option = await screen.findByRole('option', { name: 'Immediately' });
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
      await user.click(option);

      expect(onClearSelection).toHaveBeenCalledTimes(1);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/Applied ".*" to 2/i));
    });
  });

  it("offers no release or hide control: releasing a class is the Results tab's one path (MYK9-1318)", () => {
    renderBar();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hide results/i })).not.toBeInTheDocument();
  });

  it('does not duplicate the self check-in bulk actions owned by Show Desk', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /Enable Check-in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Disable Check-in/i })).not.toBeInTheDocument();
  });

  describe('offline (MYK9-849)', () => {
    beforeEach(() => {
      mockNetworkState.isOnline = false;
    });

    it('disables Apply Preset and shows a "Needs a connection" hint', () => {
      renderBar();
      expect(screen.getByRole('combobox')).toBeDisabled();
      expect(screen.getByText('Needs a connection')).toBeInTheDocument();
    });

    it('re-enables Apply Preset once back online', () => {
      const props: React.ComponentProps<typeof ResultsBulkBar> = {
        showId: 'show-1',
        selectedClasses: new Set(['a', 'b']),
        allClassIds: ['a', 'b', 'c'],
        onSelectAll: vi.fn(),
        onClearSelection: vi.fn(),
      };
      const { rerender } = render(<ResultsBulkBar {...props} />);
      expect(screen.getByRole('combobox')).toBeDisabled();

      mockNetworkState.isOnline = true;
      rerender(<ResultsBulkBar {...props} />);
      expect(screen.getByRole('combobox')).not.toBeDisabled();
      expect(screen.queryByText('Needs a connection')).not.toBeInTheDocument();
    });
  });

  describe('online but the server is unreachable (MYK9-864)', () => {
    it('disables Apply Preset with the hint after a write fails to reach the server', () => {
      renderBar();
      expect(screen.getByRole('combobox')).not.toBeDisabled();

      act(() => markServerUnreachable());

      expect(screen.getByRole('combobox')).toBeDisabled();
      expect(screen.getByText('Needs a connection')).toBeInTheDocument();
    });
  });
});
