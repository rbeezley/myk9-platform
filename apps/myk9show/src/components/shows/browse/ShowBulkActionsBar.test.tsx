import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ShowBulkActionsBar } from './ShowBulkActionsBar';
import { updateShow } from '@/services/database/shows';
import { deleteShowRecord as deleteShow } from '@/services/showDeletion';
import { notifications } from '@/lib/notifications';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

vi.mock('@/services/database/shows', () => ({
  updateShow: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

vi.mock('@/services/showDeletion', () => ({
  deleteShowRecord: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));

const purgeDeletedShow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/store/showStore', () => ({
  useShowStore: { getState: () => ({ purgeDeletedShow }), setState: vi.fn() },
}));

// The shared delete dialog reads its counts from delete_preview; nothing blocks here.
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: vi.fn().mockResolvedValue({
    trials: 1,
    classes: 2,
    entries: 3,
    shows: 0,
    dogs: 0,
    paid: 0,
    scored: 0,
    blocking: 0,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
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
    purgeDeletedShow.mockResolvedValue(undefined);
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

  function bulkBar() {
    return screen.getByRole('toolbar', { name: /bulk actions/i });
  }

  function dialog() {
    return screen.getByRole('dialog');
  }

  /** Opens the shared delete dialog and presses Delete once the counts are in. */
  async function confirmBulkDelete(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(bulkBar()).getByRole('button', { name: /^delete$/i }));
    const confirm = within(
      await screen.findByRole('dialog', { name: 'Delete 2 shows?' })
    ).getByRole('button', { name: 'Delete 2 shows' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
  }

  it('bulk status change persists a DB-valid status for every selected show', async () => {
    const user = userEvent.setup();
    renderBar();

    // The bar's own "Mark completed" button and the dialog's confirm button
    // share the same accessible name, so each click is scoped to its own
    // container rather than the destructive-click-picks-another-row trap
    // (docs/lessons/README.md#confirm-click-destructive).
    await user.click(within(bulkBar()).getByRole('button', { name: /mark completed/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /mark completed/i })
    );

    await waitFor(() => {
      expect(updateShow).toHaveBeenCalledWith('show-1', { status: 'completed' });
      expect(updateShow).toHaveBeenCalledWith('show-2', { status: 'completed' });
    });
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('bulk delete soft-deletes every selected show', async () => {
    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    await waitFor(() => {
      expect(deleteShow).toHaveBeenCalledWith('show-1', undefined, { override: false });
      expect(deleteShow).toHaveBeenCalledWith('show-2', undefined, { override: false });
    });
    await waitFor(() => expect(onBulkComplete).toHaveBeenCalledTimes(1));
  });

  it('drops every deleted show from the local copy, closes the dialog and refreshes', async () => {
    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    // The server soft-deleted them; the replica never delivers that, so each
    // must be purged locally or it stays in the list until a full sync.
    await waitFor(() => {
      expect(purgeDeletedShow).toHaveBeenCalledWith('show-1');
      expect(purgeDeletedShow).toHaveBeenCalledWith('show-2');
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/failed to delete/i)).not.toBeInTheDocument();
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog and purges the show when the server reports it already deleted', async () => {
    // writes.deleteShow reports "Show not found" as a success (see its test).
    vi.mocked(deleteShow).mockResolvedValue({
      data: { id: 'show-1' },
      error: null,
      alreadyDeleted: true,
    } as unknown as Awaited<ReturnType<typeof deleteShow>>);

    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    await waitFor(() => expect(purgeDeletedShow).toHaveBeenCalledWith('show-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/failed to delete/i)).not.toBeInTheDocument();
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('names the shows the user may not delete and keeps them listed on Permission denied', async () => {
    vi.mocked(deleteShow).mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Permission denied'), { code: '42501' }),
    } as unknown as Awaited<ReturnType<typeof deleteShow>>);

    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "Summer Classic: You don't have permission to delete this show."
    );
    expect(purgeDeletedShow).not.toHaveBeenCalled();
    expect(onBulkComplete).not.toHaveBeenCalled();
  });

  it('tells the user a show with unsynced work is still saving, and keeps it listed', async () => {
    vi.mocked(deleteShow).mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Show is still saving'), { code: 'SHOW_STILL_SAVING' }),
    } as unknown as Awaited<ReturnType<typeof deleteShow>>);

    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Summer Classic: This show is still saving. Try again in a moment.'
    );
    expect(purgeDeletedShow).not.toHaveBeenCalled();
    expect(onBulkComplete).not.toHaveBeenCalled();
  });

  it('surfaces partial failures as a toast and refreshes so retries cannot re-hit succeeded shows', async () => {
    vi.mocked(deleteShow).mockImplementation(async id =>
      id === 'show-2'
        ? ({ data: null, error: new Error('RLS rejected') } as unknown as Awaited<
            ReturnType<typeof deleteShow>
          >)
        : ({ data: {}, error: null } as Awaited<ReturnType<typeof deleteShow>>)
    );

    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith(
        '1 of 2 shows could not be deleted. The others were deleted.',
        expect.objectContaining({ description: "We couldn't delete this show. Please try again." })
      );
    });
    // Refresh + clear selection so the succeeded subset reflects immediately
    // and a retry doesn't re-delete already-deleted shows.
    expect(onBulkComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open with an inline error when every show fails', async () => {
    vi.mocked(deleteShow).mockResolvedValue({
      data: null,
      error: new Error('RLS rejected'),
    } as unknown as Awaited<ReturnType<typeof deleteShow>>);

    const user = userEvent.setup();
    renderBar();

    await confirmBulkDelete(user);

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      "Summer Classic: We couldn't delete this show. Please try again."
    );
    expect(onBulkComplete).not.toHaveBeenCalled();
  });
});
