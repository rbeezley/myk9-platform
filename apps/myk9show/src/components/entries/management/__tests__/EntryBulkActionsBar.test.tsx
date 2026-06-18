import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry, EntryClass } from '@/types/entry-management-types';
import { EntryBulkActionsBar } from '../EntryBulkActionsBar';

const aClass: EntryClass = { id: 'c1', name: 'Novice A', number: '1', fee: 25, status: 'entered' };

function entry(id: string, entryStatus: EntryStatus): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: `Dog ${id}`,
    ownerName: 'Owner',
    ownerEmail: 'o@example.com',
    handlerName: 'Handler',
    classes: [aClass],
    totalFee: 25,
    paidAmount: 0,
    entryStatus,
    paymentStatus: 'pending' as EntryManagementEntry['paymentStatus'],
    submittedAt: new Date('2026-06-01'),
    lastUpdated: new Date('2026-06-01'),
  };
}

function setup(entries: EntryManagementEntry[]) {
  const onBulkStatusChange = vi.fn();
  const onBulkCheckIn = vi.fn();
  const onClear = vi.fn();
  const utils = render(
    <EntryBulkActionsBar
      selectedEntries={entries}
      onBulkStatusChange={onBulkStatusChange}
      onBulkCheckIn={onBulkCheckIn}
      onClear={onClear}
    />
  );
  return { ...utils, onBulkStatusChange, onBulkCheckIn, onClear };
}

describe('EntryBulkActionsBar', () => {
  it('renders nothing when no entries are selected', () => {
    const { container } = setup([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count', () => {
    setup([entry('a', EntryStatus.PENDING), entry('b', EntryStatus.PENDING)]);
    expect(screen.getByText('2 entries selected')).toBeInTheDocument();
  });

  it('approve calls onBulkStatusChange with eligible ids + ACCEPTED, then clears', async () => {
    const { user, onBulkStatusChange, onClear } = setup([
      entry('p', EntryStatus.PENDING),
      entry('done', EntryStatus.COMPLETED), // ineligible — excluded
    ]);
    await user.click(screen.getByRole('button', { name: /approve/i }));

    expect(onBulkStatusChange).toHaveBeenCalledWith(['p'], EntryStatus.ACCEPTED);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('check in calls onBulkCheckIn with accepted entries only', async () => {
    const { user, onBulkCheckIn } = setup([
      entry('acc', EntryStatus.ACCEPTED),
      entry('pend', EntryStatus.PENDING), // not accepted — excluded from check-in
    ]);
    await user.click(screen.getByRole('button', { name: /check in/i }));

    expect(onBulkCheckIn).toHaveBeenCalledWith(['acc']);
  });

  it('disables actions that have no eligible entries', () => {
    setup([entry('done', EntryStatus.COMPLETED)]);
    expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /check in/i })).toBeDisabled();
  });

  it('does not offer a Waitlist action (waitlist uses the dedicated workflow)', () => {
    setup([entry('p', EntryStatus.PENDING)]);
    expect(screen.queryByRole('button', { name: /waitlist/i })).not.toBeInTheDocument();
  });

  it('reflects the eligible count in the button label', () => {
    setup([
      entry('p1', EntryStatus.PENDING),
      entry('p2', EntryStatus.PENDING),
      entry('acc', EntryStatus.ACCEPTED), // not eligible for approve (already accepted)
    ]);
    expect(screen.getByRole('button', { name: /approve \(2\)/i })).toBeInTheDocument();
  });
});
