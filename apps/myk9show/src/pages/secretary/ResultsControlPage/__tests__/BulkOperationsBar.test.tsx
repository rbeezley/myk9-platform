import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BulkOperationsBar } from '../BulkOperationsBar';

const mockBulkMutate = vi.hoisted(() => vi.fn());
const mockReleaseMutate = vi.hoisted(() => vi.fn());
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

function renderBar(overrides: Partial<React.ComponentProps<typeof BulkOperationsBar>> = {}) {
  const props: React.ComponentProps<typeof BulkOperationsBar> = {
    showId: 'show-1',
    selectedClasses: new Set(['a', 'b']),
    allClassIds: ['a', 'b', 'c'],
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onDeselectClasses: vi.fn(),
    hasManualReleaseClasses: true,
    ...overrides,
  };
  return render(<BulkOperationsBar {...props} />);
}

describe('BulkOperationsBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when no classes are selected', () => {
    const { container } = renderBar({ selectedClasses: new Set() });
    expect(container).toBeEmptyDOMElement();
  });

  it('does not release until the confirm dialog is accepted', async () => {
    const { user } = renderBar();

    // Clicking the bar button opens the confirm — it must NOT release immediately.
    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    expect(mockReleaseMutate).not.toHaveBeenCalled();

    // The irreversible-exposure warning is shown before any release happens.
    expect(
      await screen.findByText(/Results become visible to exhibitors/i)
    ).toBeInTheDocument();

    // Confirming in the dialog fires the release for the valid selected classes.
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    await waitFor(() => expect(mockReleaseMutate).toHaveBeenCalledTimes(1));
    expect(mockReleaseMutate.mock.calls[0][0]).toEqual({ classIds: ['a', 'b'], showId: 'show-1' });
  });

  it('cancelling the dialog does not release', async () => {
    const { user } = renderBar();

    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mockReleaseMutate).not.toHaveBeenCalled();
  });

  it('on partial failure, keeps only the failed classes selected', async () => {
    // Drive the mutation's onSuccess with a partial result.
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: ['a'], failed: ['b'] })
    );
    const onClearSelection = vi.fn();
    const onDeselectClasses = vi.fn();
    const { user } = renderBar({ onClearSelection, onDeselectClasses });

    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    // Succeeded class 'a' is dropped; the whole selection is NOT cleared.
    expect(onDeselectClasses).toHaveBeenCalledWith(['a']);
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('on total failure, keeps the entire selection (every class is failed)', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: [], failed: ['a', 'b'] })
    );
    const onClearSelection = vi.fn();
    const onDeselectClasses = vi.fn();
    const { user } = renderBar({ onClearSelection, onDeselectClasses });

    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(onDeselectClasses).not.toHaveBeenCalled();
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('on a clean release, clears the whole selection', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: ['a', 'b'], failed: [] })
    );
    const onClearSelection = vi.fn();
    const onDeselectClasses = vi.fn();
    const { user } = renderBar({ onClearSelection, onDeselectClasses });

    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onDeselectClasses).not.toHaveBeenCalled();
  });

  it('disables Release when no selected class uses manual release', () => {
    renderBar({ hasManualReleaseClasses: false });
    expect(screen.getByRole('button', { name: 'Release Results' })).toBeDisabled();
  });

  it('explains why Release is disabled instead of leaving it silently greyed', () => {
    renderBar({ hasManualReleaseClasses: false });
    expect(
      screen.getByText(/Only classes set to hold for review can be released here/i)
    ).toBeInTheDocument();
  });

  it('shows no release hint when Release is available', () => {
    renderBar({ hasManualReleaseClasses: true });
    expect(
      screen.queryByText(/Only classes set to hold for review/i)
    ).not.toBeInTheDocument();
  });

  it('toasts success on a clean release', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: ['a', 'b'], failed: [] })
    );
    const { user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringMatching(/Released results for 2/i));
  });

  it('warns on a partial release so it never resolves silently', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: ['a'], failed: ['b'] })
    );
    const { user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringMatching(/1 failed/i));
  });

  it('errors on a total release failure', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) =>
      opts?.onSuccess?.({ released: [], failed: ['a', 'b'] })
    );
    const { user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not release/i));
  });

  it('errors when the release mutation rejects', async () => {
    mockReleaseMutate.mockImplementation((_vars, opts) => opts?.onError?.());
    const { user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Release Results' }));
    const confirm = screen.getByRole('alertdialog').querySelector('button:last-of-type');
    await user.click(confirm as HTMLElement);

    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not release/i));
  });

  it('gives every action button a 44px minimum touch height', () => {
    renderBar();
    for (const name of ['Clear', 'Enable Check-in', 'Disable Check-in', 'Release Results']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toHaveClass('min-h-[44px]');
    }
  });
});
