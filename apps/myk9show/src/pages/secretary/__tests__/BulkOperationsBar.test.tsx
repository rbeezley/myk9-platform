import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkOperationsBar } from '../ResultsControlPage/BulkOperationsBar';

// Mock mutations
const mockClassMutate = vi.fn();
const mockReleaseMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateClassOverride: () => ({ mutate: mockClassMutate, isPending: false }),
  useBulkUpdateClassOverrides: () => ({ mutate: mockClassMutate, isPending: false }),
}));
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: mockReleaseMutate, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

function renderBar(selectedCount: number, options?: { hasManualReleaseClasses?: boolean }) {
  const selectedClasses = new Set(
    Array.from({ length: selectedCount }, (_, i) => `class-${i + 1}`)
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const clearSelection = vi.fn();
  return {
    clearSelection,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BulkOperationsBar
          showId="show-1"
          selectedClasses={selectedClasses}
          allClassIds={['class-1', 'class-2', 'class-3']}
          onSelectAll={vi.fn()}
          onClearSelection={clearSelection}
          hasManualReleaseClasses={options?.hasManualReleaseClasses ?? false}
        />
      </QueryClientProvider>
    ),
  };
}

describe('BulkOperationsBar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render when no classes are selected', () => {
    renderBar(0);
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('shows selection count', () => {
    renderBar(2);
    expect(screen.getByText(/2 classes selected/i)).toBeInTheDocument();
  });

  it('disables Release Results when no manual_release classes', () => {
    renderBar(2, { hasManualReleaseClasses: false });
    expect(screen.getByRole('button', { name: /release results/i })).toBeDisabled();
  });

  it('enables Release Results when manual_release classes exist', () => {
    renderBar(2, { hasManualReleaseClasses: true });
    expect(screen.getByRole('button', { name: /release results/i })).toBeEnabled();
  });

  it('calls clearSelection when Clear is clicked', async () => {
    const { clearSelection } = renderBar(2);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearSelection).toHaveBeenCalled();
  });
});
