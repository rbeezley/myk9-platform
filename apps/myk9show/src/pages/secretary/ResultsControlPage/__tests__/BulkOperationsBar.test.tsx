import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BulkOperationsBar } from '../BulkOperationsBar';

const mockBulkMutate = vi.hoisted(() => vi.fn());
const mockReleaseMutate = vi.hoisted(() => vi.fn());

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
      await screen.findByText(/makes results publicly visible/i)
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

  it('disables Release when no selected class uses manual release', () => {
    renderBar({ hasManualReleaseClasses: false });
    expect(screen.getByRole('button', { name: 'Release Results' })).toBeDisabled();
  });

  it('gives every action button a 44px minimum touch height', () => {
    renderBar();
    for (const name of ['Clear', 'Enable Check-in', 'Disable Check-in', 'Release Results']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toHaveClass('min-h-[44px]');
    }
  });
});
