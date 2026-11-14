import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STATUS_UNDO_WINDOW_MS } from '@/lib/undoToast';
import { render } from '@/test/utils/testUtils';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { queueFor } from './queueFixture';

const h = vi.hoisted(() => ({
  updateReplicatedCheckInStatus: vi.fn(),
  scratchShowMapEntry: vi.fn(),
  undoShowMapScratch: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: h.updateReplicatedCheckInStatus,
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({
  scratchShowMapEntry: h.scratchShowMapEntry,
  undoShowMapScratch: h.undoShowMapScratch,
}));
vi.mock('@/lib/undoToast', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/undoToast')>()),
  showUndoToast: h.showUndoToast,
}));

function entry(
  id: string,
  dogName: string,
  overrides: Partial<SecretaryCockpitClassEntry> = {}
): SecretaryCockpitClassEntry {
  return {
    nodeId: `entry:${id}`,
    queue: queueFor(`entry:${id}`, '101', overrides.state ?? 'waiting'),
    entryId: id,
    armband: '101',
    dogName,
    checkIn: { value: 'no-status', label: 'Not checked in', kind: 'neutral' },
    checkInValue: 'no-status',
    deskEditable: true,
    lockedReason: null,
    state: 'waiting',
    counted: true,
    notCheckedIn: true,
    place: 1,
    result: null,
    ...overrides,
  };
}

const waiting = entry('e-1', 'Moss');
const scored = entry('e-2', 'Piper', {
  checkIn: { value: 'checked-in', label: 'Checked in', kind: 'complete' },
  checkInValue: 'checked-in',
  deskEditable: false,
  lockedReason: 'Scored, so the status is locked',
  state: 'scored',
  notCheckedIn: false,
  place: null,
});

function renderTable(canChangeCheckIn: boolean, onRefreshEntries?: () => Promise<void>) {
  return render(
    <ClassEntriesTable
      entries={[waiting, scored]}
      className="Container Novice A"
      canChangeCheckIn={canChangeCheckIn}
      {...(onRefreshEntries && { onRefreshEntries })}
    />
  );
}

describe('the class table Check-in cell opens the desk status picker (MYK9-1797)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.updateReplicatedCheckInStatus.mockResolvedValue(undefined);
    h.scratchShowMapEntry.mockResolvedValue({ entryId: 'e-1', previousEntryStatus: 'accepted' });
  });

  it('puts a button on a dog that is not checked in, and opens the desk picker from it', async () => {
    const { user } = renderTable(true);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    expect(within(picker).getByText('Moss')).toBeInTheDocument();
    // The desk's words and its six statuses (the seventh button is the dialog's Close).
    ['Not checked in', 'Checked-in', 'Conflict', 'Pulled', 'At Gate', 'Come to Gate'].forEach(
      label =>
        expect(
          within(picker).getByRole('button', { name: new RegExp(`^${label}`, 'i') })
        ).toBeInTheDocument()
    );
    expect(within(picker).queryByRole('button', { name: /^In ring/i })).toBeNull();
  });

  it('writes the chosen status for that entry through the desk write', async () => {
    const { user } = renderTable(true);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Checked-in/ }));
    await waitFor(() =>
      expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledWith('e-1', 'checked-in')
    );
    expect(h.updateReplicatedCheckInStatus).toHaveBeenCalledTimes(1);
  });

  it('frees the cell once the write is stored, though the entries re-read never settles (MYK9-1812)', async () => {
    const onRefreshEntries = vi.fn(() => new Promise<void>(() => {}));
    const { user } = renderTable(true, onRefreshEntries);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Checked-in/ }));
    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));

    // The table shows the shared entries (still "Not checked in" here) and the cell is usable.
    expect(
      await screen.findByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    ).toBeEnabled();
  });

  it('re-reads the entries after a status change, so the table does not keep the old value', async () => {
    const onRefreshEntries = vi.fn().mockResolvedValue(undefined);
    const { user } = renderTable(true, onRefreshEntries);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Checked-in/ }));
    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));
  });

  it('re-reads the entries after a confirmed Pull', async () => {
    const onRefreshEntries = vi.fn().mockResolvedValue(undefined);
    const { user } = renderTable(true, onRefreshEntries);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Pulled/ }));
    const confirm = await screen.findByRole('dialog', { name: 'Pull Moss?' });
    expect(onRefreshEntries).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Pull' }));
    await waitFor(() => expect(onRefreshEntries).toHaveBeenCalledTimes(1));
  });

  it('asks first on Pulled, then pulls through the shared Pull with Undo', async () => {
    const { user } = renderTable(true);
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Pulled/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Pull Moss?' });
    expect(h.scratchShowMapEntry).not.toHaveBeenCalled();
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Pull' }));
    await waitFor(() =>
      expect(h.scratchShowMapEntry).toHaveBeenCalledWith('e-1', undefined, 'Pulled at Show Desk')
    );
    await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));
    // Names the dog and the class, and lasts as long as every other day-of Undo.
    expect(h.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Moss pulled from Container Novice A',
        duration: STATUS_UNDO_WINDOW_MS,
      })
    );
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('renders a locked row as the same control, disabled, with the reason visible', () => {
    renderTable(true);
    const locked = screen.getByRole('button', { name: 'Check-in for Piper: Checked in, locked' });
    expect(locked).toBeDisabled();
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.getByText('Scored, so the status is locked')).toBeInTheDocument();
  });

  it('never leaves a locked dog with no status blank', () => {
    const { container } = render(
      <ClassEntriesTable
        entries={[
          entry('e-3', 'Rune', {
            deskEditable: false,
            lockedReason: 'Pulled, so the status is locked',
          }),
        ]}
        className="Container Novice A"
        canChangeCheckIn
      />
    );
    expect(screen.getByRole('button', { name: /Check-in for Rune/ })).toBeDisabled();
    expect(screen.getByText('No status')).toBeInTheDocument();
    expect(container.querySelectorAll('td')[4]?.textContent).not.toBe('');
  });

  it('gives a read-only user the same shape as text, never blank, with no button', () => {
    renderTable(false);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.getByText('No status')).toBeInTheDocument();
    expect(screen.queryByText('Scored, so the status is locked')).toBeNull();
  });

  it('renders the armband in the shared tile', () => {
    renderTable(true);
    const [tile] = screen.getAllByText('101');
    expect(tile).toHaveClass('rounded-lg', 'bg-primary', 'h-8', 'min-w-8');
  });

  it('does not say "Not checked in" twice on a dog that has not turned up', () => {
    renderTable(true);
    expect(screen.getAllByText('Not checked in')).toHaveLength(1);
  });
});
