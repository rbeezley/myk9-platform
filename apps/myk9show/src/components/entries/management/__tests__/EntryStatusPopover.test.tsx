import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { toRowActions } from '@/components/ui/RowActionMenu';
import { entryActions, resolveEntryStatusActions } from '../entryActions';
import { EntryStatusPopover } from '../EntryStatusPopover';

function makeEntry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'registration-1',
    entryNumber: '#1',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Fido',
    ownerName: 'Jane Smith',
    ownerEmail: 'jane@example.com',
    handlerName: 'Jane Smith',
    classes: [
      {
        id: 'class-1',
        name: 'Novice A',
        number: '101',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-01-01'),
    lastUpdated: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('entry status action definitions', () => {
  it('resolves only eligible status transitions and stays in parity with row actions', () => {
    const entry = makeEntry();
    const handlers = { onStatusChange: vi.fn() };
    const inline = resolveEntryStatusActions(entry, handlers);
    const row = toRowActions(entry, handlers, entryActions);

    expect(inline.map(action => action.id)).toEqual([
      'accept',
      'missing-info',
      'pull',
      'reject',
    ]);
    expect(
      row
        .filter(
          action => !action.hidden && inline.some(inlineAction => inlineAction.id === action.id)
        )
        .map(action => action.id)
    ).toEqual(inline.map(action => action.id));
  });

  it('does not offer a transition that is already the current status', () => {
    const inline = resolveEntryStatusActions(makeEntry({ entryStatus: EntryStatus.ACCEPTED }), {
      onStatusChange: vi.fn(),
    });

    expect(inline.map(action => action.id)).toEqual(['pending', 'missing-info', 'pull', 'reject']);
  });
});

describe('EntryStatusPopover', () => {
  it('opens from a real button and dispatches the shared action on pointer and keyboard activation', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <EntryStatusPopover
        entry={makeEntry()}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Change entry status for Fido in Novice A',
    });
    expect(trigger).toHaveClass('min-h-11');

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
    const accept = screen.getByRole('menuitem', { name: 'Accept entry' });
    expect(accept).toHaveClass('min-h-11');
    await user.click(accept);

    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
  });

  it('keeps check-in actions out of the status popover and offers retry after failure', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(
      <EntryStatusPopover
        entry={makeEntry()}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    expect(screen.queryByText('Check in all classes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Accept entry' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
    await user.click(screen.getByRole('button', { name: 'Retry status update' }));
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });
});
