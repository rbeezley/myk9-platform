import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { WorkbenchLateEntryAction } from '../WorkbenchLateEntryAction';

const getClassesWithCapacityMock = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: getClassesWithCapacityMock,
}));

vi.mock('@/pages/secretary/DayOfOperationsPage/DayOfEntryDialog', () => ({
  DayOfEntryDialog: ({
    open,
    showId,
    userId,
    classes,
    onSuccess,
  }: {
    open: boolean;
    showId: string;
    userId?: string;
    classes: Array<{ id: string }>;
    onSuccess: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Add Day-of Entry">
        <span data-testid="dialog-show-id">{showId}</span>
        <span data-testid="dialog-user-id">{userId}</span>
        <span data-testid="dialog-class-count">{classes.length}</span>
        <button type="button" onClick={onSuccess}>
          Complete late entry
        </button>
      </div>
    ) : null,
}));

describe('WorkbenchLateEntryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    getClassesWithCapacityMock.mockResolvedValue({
      data: [
        {
          id: 'class-1',
          name: 'Container Novice A',
          class_number: '101',
          max_entries: 25,
          accepted_count: 10,
          available_spots: 15,
        },
      ],
      error: null,
    });
  });

  it('opens the existing day-of entry dialog with show, user, and class capacity', async () => {
    const { user } = render(<WorkbenchLateEntryAction showId="show-1" />);

    expect(await screen.findByText('1 class with space')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add late entry' }));

    expect(screen.getByRole('dialog', { name: 'Add Day-of Entry' })).toBeInTheDocument();
    expect(screen.getByTestId('dialog-show-id')).toHaveTextContent('show-1');
    expect(screen.getByTestId('dialog-user-id')).toHaveTextContent('user-1');
    expect(screen.getByTestId('dialog-class-count')).toHaveTextContent('1');
  });

  it('refreshes capacity and show-day entry queries after success', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { user } = render(<WorkbenchLateEntryAction showId="show-1" />, { queryClient });

    await user.click(await screen.findByRole('button', { name: 'Add late entry' }));
    await user.click(screen.getByRole('button', { name: 'Complete late entry' }));

    await waitFor(() => expect(getClassesWithCapacityMock).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.showEntries('show-1') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.checkInReport('show-1') });
  });

  it('disables the action when no class has space', async () => {
    getClassesWithCapacityMock.mockResolvedValueOnce({
      data: [
        {
          id: 'class-1',
          name: 'Container Novice A',
          class_number: '101',
          max_entries: 25,
          accepted_count: 25,
          available_spots: 0,
        },
      ],
      error: null,
    });

    render(<WorkbenchLateEntryAction showId="show-1" />);

    expect(await screen.findByText('No classes with space')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add late entry' })).toBeDisabled();
  });
});

