import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { LunchOrdersTool } from '../LunchOrdersTool';
import type { LunchOrderRow } from '../lunchOrders';
import type { SaveLunchOrderInput } from '../lunchOrdersService';

const mocks = vi.hoisted(() => ({ save: vi.fn(), list: vi.fn() }));

vi.mock('../lunchOrdersService', () => ({
  lunchOrdersService: { listForTrial: mocks.list, save: mocks.save, remove: vi.fn() },
}));
vi.mock('@/features/judge-supplies/useTrialJudges', () => ({
  useTrialJudges: () => ({
    data: [{ person_id: 'p-judge', judge_name: 'Jo Judge' }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('../useLunchOrders', async importOriginal => ({
  ...(await importOriginal<typeof import('../useLunchOrders')>()),
  useVolunteersOnDays: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

/** A fake database whose saves finish only when the test releases them. */
function slowDatabase() {
  let rows: LunchOrderRow[] = [];
  const releases: Array<() => void> = [];
  mocks.list.mockImplementation(async () => rows);
  mocks.save.mockImplementation((input: SaveLunchOrderInput) => {
    return new Promise<void>(resolve => {
      releases.push(() => {
        if (input.savedId === null && rows.length === 0) {
          rows = [
            {
              id: 'row-new',
              trial_id: input.trialId,
              person_id: input.personId,
              name: input.name,
              role: input.role,
              lunch_order: input.lunchOrder ?? null,
              dietary_note: input.dietaryNote ?? null,
            },
          ];
        }
        resolve();
      });
    });
  });
  return { releaseNext: () => releases.shift()?.() };
}

function renderTool() {
  return render(<LunchOrdersTool showId="show-1" trials={[{ id: 'trial-1', name: 'Sat' }]} />);
}

describe('lunch order save queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs two edits made during one slow save in order, the second updating the row the first created', async () => {
    const db = slowDatabase();
    const user = userEvent.setup();
    renderTool();

    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');
    await user.tab();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText('Dietary note for Jo Judge'), 'No dairy');
    await user.tab();
    // Queued behind the first: it has not reached the server yet, and "Saved" is not claimed.
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeInTheDocument();

    db.releaseNext();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));

    expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({
      savedId: null,
      personId: 'p-judge',
      lunchOrder: 'Wrap',
    });
    // Resolved at run time: the first save's row, not a second insert.
    expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
      savedId: 'row-new',
      dietaryNote: 'No dairy',
    });
    expect(mocks.save.mock.calls[1]?.[0]).not.toHaveProperty('lunchOrder');

    db.releaseNext();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('still runs a queued edit after the tool unmounts during a pending save', async () => {
    const db = slowDatabase();
    const user = userEvent.setup();
    const { unmount } = renderTool();

    await user.type(await screen.findByLabelText('Lunch order for Jo Judge'), 'Wrap');
    await user.tab();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText('Dietary note for Jo Judge'), 'No dairy');

    // Closing the panel: the note field never blurred.
    unmount();
    db.releaseNext();

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
      savedId: 'row-new',
      dietaryNote: 'No dairy',
    });
  });
});
