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

    expect(inline.map(action => action.id)).toEqual(['accept', 'missing-info', 'pull', 'reject']);
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
    const accept = screen.getByRole('menuitem', { name: 'Accept' });
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
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
    await user.click(screen.getByRole('button', { name: 'Retry status update' }));
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it('marks the entry current status as inert in the menu', async () => {
    const user = userEvent.setup();
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.ACCEPTED })}
        entryClassName="Novice A"
        onStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );

    const currentItem = screen.getByRole('menuitem', { name: /Accepted/ });
    expect(currentItem).toHaveAttribute('aria-disabled', 'true');
    expect(currentItem).toHaveTextContent(/current/i);
    await user.click(currentItem);
    // Inert row must not dispatch a status change.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('confirms before reverting a completed entry to a pre-scoring status', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.COMPLETED })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText('This entry has a recorded result')).toBeInTheDocument();

    // Cancel is a no-op.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByText('This entry has a recorded result')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Change status' }));

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
  });

  it('does not show a confirmation for non-scored entries', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.PENDING })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    expect(screen.queryByText('This entry has a recorded result')).not.toBeInTheDocument();
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.ACCEPTED);
  });

  it('double-activation of the confirm button only submits once', async () => {
    const user = userEvent.setup();
    let resolveChange: (value: boolean) => void = () => {};
    const onStatusChange = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          resolveChange = resolve;
        })
    );
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.COMPLETED })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));

    const confirmButton = screen.getByRole('button', { name: 'Change status' });
    await user.click(confirmButton);
    await user.click(confirmButton);
    resolveChange(true);

    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });

  it('confirms a revert for a scored entry that is still ACCEPTED (scoring facts, not just COMPLETED status)', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.ACCEPTED, isScored: true })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Mark pending' }));

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.getByText('This entry has a recorded result')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change status' }));
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.PENDING);
  });

  it('confirms a revert for an entry with a recorded resultStatus even when isScored is unset', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.ACCEPTED, resultStatus: 'qualified' })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Mark pending' }));

    expect(screen.getByText('This entry has a recorded result')).toBeInTheDocument();
  });

  it("does not prompt for the default 'pending' resultStatus placeholder on unscored entries", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({
          entryStatus: EntryStatus.ACCEPTED,
          resultStatus: 'pending',
          isScored: false,
        })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Mark pending' }));

    expect(screen.queryByText('This entry has a recorded result')).not.toBeInTheDocument();
    expect(onStatusChange).toHaveBeenCalledWith('entry-1', EntryStatus.PENDING);
  });

  it('surfaces the retry/failure path when the confirmed status change rejects', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockRejectedValueOnce(new Error('boom'));
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.COMPLETED })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Change status' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update status.");
  });

  it('cancel produces no toast and no success side effect', async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn().mockResolvedValue(true);
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.COMPLETED })}
        entryClassName="Novice A"
        onStatusChange={onStatusChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the current-status row with the canonical vocabulary label, not the status-descriptor label', async () => {
    const user = userEvent.setup();
    render(
      <EntryStatusPopover
        entry={makeEntry({ entryStatus: EntryStatus.WAITLIST })}
        entryClassName="Novice A"
        onStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Change entry status for Fido in Novice A' })
    );

    // Canonical vocabulary (reviewStateLabels) says "Waitlisted", not the
    // status-descriptor's "Wait list".
    expect(screen.getByRole('menuitem', { name: 'Waitlisted (current)' })).toBeInTheDocument();
    expect(screen.queryByText('Wait list (current)')).not.toBeInTheDocument();
  });
});
