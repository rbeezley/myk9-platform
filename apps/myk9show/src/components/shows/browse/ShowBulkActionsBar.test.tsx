import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowBulkActionsBar } from './ShowBulkActionsBar';
import { updateShow, deleteShow } from '@/services/database/shows';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

vi.mock('@/services/database/shows', () => ({
  updateShow: vi.fn().mockResolvedValue({ data: {}, error: null }),
  deleteShow: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

function makeShow(id: string, name: string): EnhancedShow {
  return {
    id,
    name,
    organization: 'AKC',
    startDate: '2026-07-01',
    endDate: '2026-07-02',
    location: 'Fairgrounds',
    status: 'draft',
  } as EnhancedShow;
}

const shows = [makeShow('show-1', 'Summer Classic'), makeShow('show-2', 'Fall Trial')];

describe('ShowBulkActionsBar', () => {
  const onClearSelection = vi.fn();
  const onBulkComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateShow).mockResolvedValue({ data: {}, error: null } as Awaited<
      ReturnType<typeof updateShow>
    >);
    vi.mocked(deleteShow).mockResolvedValue({ data: {}, error: null } as Awaited<
      ReturnType<typeof deleteShow>
    >);
  });

  function renderBar() {
    return render(
      <ShowBulkActionsBar
        selectedShows={shows}
        onClearSelection={onClearSelection}
        onBulkComplete={onBulkComplete}
      />
    );
  }

  it('bulk status change persists a DB-valid status for every selected show', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: /status/i }));
    await user.click(await screen.findByRole('menuitem', { name: /mark completed/i }));
    await user.click(screen.getByRole('button', { name: /mark completed/i }));

    await waitFor(() => {
      expect(updateShow).toHaveBeenCalledWith('show-1', { status: 'completed' });
      expect(updateShow).toHaveBeenCalledWith('show-2', { status: 'completed' });
    });
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('bulk delete soft-deletes every selected show', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /delete shows/i }));

    await waitFor(() => {
      expect(deleteShow).toHaveBeenCalledWith('show-1');
      expect(deleteShow).toHaveBeenCalledWith('show-2');
    });
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('surfaces partial failures instead of reporting success', async () => {
    vi.mocked(deleteShow).mockImplementation(async id =>
      id === 'show-2'
        ? ({ data: null, error: new Error('RLS rejected') } as unknown as Awaited<
            ReturnType<typeof deleteShow>
          >)
        : ({ data: {}, error: null } as Awaited<ReturnType<typeof deleteShow>>)
    );

    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(await screen.findByRole('button', { name: /delete shows/i }));

    expect(await screen.findByText(/failed to delete 1 of 2 shows/i)).toBeInTheDocument();
    expect(onBulkComplete).not.toHaveBeenCalled();
  });
});
