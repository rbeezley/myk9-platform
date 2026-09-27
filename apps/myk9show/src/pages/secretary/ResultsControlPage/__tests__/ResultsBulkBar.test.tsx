import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ResultsBulkBar } from '../ResultsBulkBar';

const mockBulkMutate = vi.hoisted(() => vi.fn());
const mockReleaseMutate = vi.hoisted(() => vi.fn());
const mockUnreleaseMutate = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useBulkUpdateClassOverrides: () => ({ mutate: mockBulkMutate, isPending: false }),
}));

vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: mockReleaseMutate, isPending: false }),
}));

vi.mock('@/hooks/mutations/useUnreleaseResults', () => ({
  useUnreleaseResults: () => ({ mutate: mockUnreleaseMutate, isPending: false }),
}));

function renderBar(overrides: Partial<React.ComponentProps<typeof ResultsBulkBar>> = {}) {
  const props: React.ComponentProps<typeof ResultsBulkBar> = {
    showId: 'show-1',
    selectedClasses: new Set(['a', 'b']),
    allClassIds: ['a', 'b', 'c'],
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onDeselectClasses: vi.fn(),
    hasManualReleaseClasses: true,
    hasReleasedClasses: false,
    ...overrides,
  };
  return render(<ResultsBulkBar {...props} />);
}

function getDialogConfirmButton() {
  return screen.getByRole('alertdialog').querySelector('button:last-of-type') as HTMLElement;
}

describe('ResultsBulkBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      await user.click(await screen.findByText('Immediately'));

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
      await user.click(await screen.findByText('Immediately'));

      expect(onClearSelection).toHaveBeenCalledTimes(1);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/Applied ".*" to 2/i));
    });
  });

  describe('Release Results', () => {
    it('does not release until the confirm dialog is accepted', async () => {
      const { user } = renderBar();

      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      expect(mockReleaseMutate).not.toHaveBeenCalled();

      expect(await screen.findByText(/Results become visible to exhibitors/i)).toBeInTheDocument();

      await user.click(getDialogConfirmButton());

      await waitFor(() => expect(mockReleaseMutate).toHaveBeenCalledTimes(1));
      expect(mockReleaseMutate.mock.calls[0][0]).toEqual({
        classIds: ['a', 'b'],
        showId: 'show-1',
      });
    });

    it('cancelling the dialog does not release', async () => {
      const { user } = renderBar();

      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(mockReleaseMutate).not.toHaveBeenCalled();
    });

    it('disables Release when no selected class uses manual release', () => {
      renderBar({ hasManualReleaseClasses: false });
      expect(screen.getByRole('button', { name: 'Release Results' })).toBeDisabled();
    });

    it('on partial failure, keeps only the failed classes selected', async () => {
      mockReleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ released: ['a'], failed: ['b'] })
      );
      const onClearSelection = vi.fn();
      const onDeselectClasses = vi.fn();
      const { user } = renderBar({ onClearSelection, onDeselectClasses });

      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      await user.click(getDialogConfirmButton());

      expect(onDeselectClasses).toHaveBeenCalledWith(['a']);
      expect(onClearSelection).not.toHaveBeenCalled();
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringMatching(/1 failed/i));
    });

    it('on total failure, keeps the entire selection (every class is failed)', async () => {
      mockReleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ released: [], failed: ['a', 'b'] })
      );
      const onClearSelection = vi.fn();
      const onDeselectClasses = vi.fn();
      const { user } = renderBar({ onClearSelection, onDeselectClasses });

      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      await user.click(getDialogConfirmButton());

      expect(onDeselectClasses).not.toHaveBeenCalled();
      expect(onClearSelection).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not release/i));
    });

    it('on a clean release, clears the whole selection and toasts success', async () => {
      mockReleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ released: ['a', 'b'], failed: [] })
      );
      const onClearSelection = vi.fn();
      const { user } = renderBar({ onClearSelection });

      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      await user.click(getDialogConfirmButton());

      expect(onClearSelection).toHaveBeenCalledTimes(1);
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringMatching(/Released results for 2/i)
      );
    });

    it('errors when the release mutation rejects', async () => {
      mockReleaseMutate.mockImplementation((_vars, opts) => opts?.onError?.());
      const { user } = renderBar();
      await user.click(screen.getByRole('button', { name: 'Release Results' }));
      await user.click(getDialogConfirmButton());

      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not release/i));
    });
  });

  describe('Hide Results (un-release)', () => {
    it('is not offered when no selected class is released', () => {
      renderBar({ hasReleasedClasses: false });
      expect(screen.queryByRole('button', { name: /hide results/i })).not.toBeInTheDocument();
    });

    it('is offered when a selected class is released', () => {
      renderBar({ hasReleasedClasses: true });
      expect(screen.getByRole('button', { name: /hide results/i })).toBeInTheDocument();
    });

    it('does not un-release until the confirm dialog is accepted', async () => {
      const { user } = renderBar({ hasReleasedClasses: true });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      expect(mockUnreleaseMutate).not.toHaveBeenCalled();

      expect(await screen.findByText(/won.t see it retroactively/i)).toBeInTheDocument();

      await user.click(getDialogConfirmButton());

      await waitFor(() => expect(mockUnreleaseMutate).toHaveBeenCalledTimes(1));
      expect(mockUnreleaseMutate.mock.calls[0][0]).toEqual({
        classIds: ['a', 'b'],
        showId: 'show-1',
      });
    });

    it('cancelling the dialog does not un-release', async () => {
      const { user } = renderBar({ hasReleasedClasses: true });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(mockUnreleaseMutate).not.toHaveBeenCalled();
    });

    it('on a clean hide, clears the whole selection', async () => {
      mockUnreleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ unreleased: ['a', 'b'], failed: [] })
      );
      const onClearSelection = vi.fn();
      const { user } = renderBar({ hasReleasedClasses: true, onClearSelection });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      await user.click(getDialogConfirmButton());

      expect(onClearSelection).toHaveBeenCalledTimes(1);
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/Hid results for 2/i));
    });

    it('on partial failure, keeps only the failed classes selected and warns', async () => {
      mockUnreleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ unreleased: ['a'], failed: ['b'] })
      );
      const onClearSelection = vi.fn();
      const onDeselectClasses = vi.fn();
      const { user } = renderBar({
        hasReleasedClasses: true,
        onClearSelection,
        onDeselectClasses,
      });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      await user.click(getDialogConfirmButton());

      expect(onDeselectClasses).toHaveBeenCalledWith(['a']);
      expect(onClearSelection).not.toHaveBeenCalled();
      expect(mockToast.warning).toHaveBeenCalledWith(expect.stringMatching(/1 failed/i));
    });

    it('on total failure, keeps the whole selection and errors', async () => {
      mockUnreleaseMutate.mockImplementation((_vars, opts) =>
        opts?.onSuccess?.({ unreleased: [], failed: ['a', 'b'] })
      );
      const onClearSelection = vi.fn();
      const onDeselectClasses = vi.fn();
      const { user } = renderBar({
        hasReleasedClasses: true,
        onClearSelection,
        onDeselectClasses,
      });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      await user.click(getDialogConfirmButton());

      expect(onDeselectClasses).not.toHaveBeenCalled();
      expect(onClearSelection).not.toHaveBeenCalled();
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not hide/i));
    });

    it('errors when the unrelease mutation rejects', async () => {
      mockUnreleaseMutate.mockImplementation((_vars, opts) => opts?.onError?.());
      const { user } = renderBar({ hasReleasedClasses: true });

      await user.click(screen.getByRole('button', { name: /hide results/i }));
      await user.click(getDialogConfirmButton());

      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not hide/i));
    });
  });

  it('does not duplicate the self check-in bulk actions owned by Show Desk', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /Enable Check-in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Disable Check-in/i })).not.toBeInTheDocument();
  });
});
