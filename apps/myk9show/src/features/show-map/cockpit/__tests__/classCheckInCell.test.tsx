import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassEntriesTable } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';

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
vi.mock('@/lib/undoToast', () => ({ showUndoToast: h.showUndoToast }));

function entry(
  id: string,
  dogName: string,
  overrides: Partial<SecretaryCockpitClassEntry> = {}
): SecretaryCockpitClassEntry {
  return {
    nodeId: `entry:${id}`,
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
    // The row shows the write at once.
    expect(
      await screen.findByRole('button', { name: 'Change check-in for Moss: Checked in' })
    ).toBeInTheDocument();
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
      expect(h.scratchShowMapEntry).toHaveBeenCalledWith(
        'e-1',
        undefined,
        'Pulled at the check-in desk'
      )
    );
    await waitFor(() => expect(h.showUndoToast).toHaveBeenCalledTimes(1));
    expect(h.updateReplicatedCheckInStatus).not.toHaveBeenCalled();
  });

  it('offers no change on a locked row, and says why', () => {
    renderTable(true);
    expect(screen.queryByRole('button', { name: /Change check-in for Piper/ })).toBeNull();
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.getByText('Scored, so the status is locked')).toBeInTheDocument();
  });

  it('gives a read-only user the status as text, with no button and no locked reason', () => {
    renderTable(false);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.queryByText('Scored, so the status is locked')).toBeNull();
  });

  it('does not say "Not checked in" twice on a dog that has not turned up', () => {
    renderTable(true);
    expect(screen.getAllByText('Not checked in')).toHaveLength(1);
  });
});
