import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { DeleteDogDialog } from './DeleteDogDialog';
import type { Dog } from '@/types/dog-types';
import { buildBlockedText, buildImpactSuffix, buildWarningText } from './deleteDogDialogCopy';
import { toBlockingEntryCountState } from './blockingEntryCount';

describe('DeleteDogDialog buildImpactSuffix', () => {
  it('is empty when the dog has no active entries', () => {
    expect(buildImpactSuffix(0)).toBe('');
  });

  it('is empty while the count is still loading (undefined)', () => {
    expect(buildImpactSuffix(undefined)).toBe('');
  });

  it('uses the singular noun for exactly one entry', () => {
    expect(buildImpactSuffix(1)).toBe(' and 1 entry');
  });

  it('uses the plural noun for multiple entries', () => {
    expect(buildImpactSuffix(2)).toBe(' and 2 entries');
  });
});

describe('DeleteDogDialog buildWarningText', () => {
  it('tells a non-admin the action cannot be undone (restore UI is admin-only)', () => {
    expect(buildWarningText(2, false)).toBe('This action cannot be undone.');
    expect(buildWarningText(0, false)).toBe('This action cannot be undone.');
  });

  it('gives an admin the restore note, dog-only when there are no entries', () => {
    expect(buildWarningText(0, true)).toBe(
      'The dog can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('gives an admin the restore note naming entries when they cascade', () => {
    expect(buildWarningText(3, true)).toBe(
      'The dog and its entries can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('admin restore note never claims the action cannot be undone', () => {
    expect(buildWarningText(3, true)).not.toMatch(/cannot be undone/i);
  });
});

describe('DeleteDogDialog buildBlockedText', () => {
  it('is null when nothing blocks the delete', () => {
    expect(buildBlockedText(0)).toBeNull();
    expect(buildBlockedText(undefined)).toBeNull();
  });

  it('names the count, agrees the pronoun, and names the escalation that exists', () => {
    // A secretary who cannot scratch or refund (the entry is scored, the show
    // is closed out) was left with no next step at all. A site admin CAN delete
    // the dog, so say so rather than leaving them to discover it.
    expect(buildBlockedText(1)).toBe(
      'This dog has 1 paid or scored entry. Scratch or refund it before deleting, or ask a site admin to delete the dog.'
    );
    expect(buildBlockedText(2)).toBe(
      'This dog has 2 paid or scored entries. Scratch or refund them before deleting, or ask a site admin to delete the dog.'
    );
  });

  it('does not tell a site admin to ask a site admin', () => {
    // The override checkbox is directly below this sentence for them.
    expect(buildBlockedText(1, true)).toBe(
      'This dog has 1 paid or scored entry. Scratch or refund it before deleting.'
    );
  });

  it('outranks the admin restore note — the refusal is the operative fact', () => {
    // An admin seeing "can be restored" on a delete the server will REFUSE is
    // the worst of both: it reads as reassurance about an action that will not
    // happen at all.
    expect(buildWarningText(3, true, 1)).toBe(
      'This dog has 1 paid or scored entry. Scratch or refund it before deleting, or ask a site admin to delete the dog.'
    );
  });
});

const dog = { id: 'dog-1', callName: 'Rex', name: 'Rex', breed: 'Border Collie' } as Dog;

// Rendered, not asserted off the copy builders: the whole point is that the
// button the user can press is unpressable. A test on buildBlockedText alone
// would pass with `confirmDisabled` never wired to anything.
describe('DeleteDogDialog blocked state', () => {
  it('disables Delete when the dog has blocking entries', () => {
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'ready', count: 1 }}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    expect(screen.getByText(/scratch or refund it before deleting/i)).toBeInTheDocument();
  });

  it('leaves Delete enabled when the count is known to be zero', () => {
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'ready', count: 0 }}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
  });
});

/**
 * MYK9-600: unknown is not zero.
 *
 * The count used to arrive as `number | undefined`, and the dialog read
 * `(count ?? 0) > 0`. A failed count therefore rendered as "nothing blocks
 * this" — a plain, enabled Delete with no override affordance, which the server
 * then refused with MK002 and no way forward. The two unknown states are now
 * distinct from zero and from each other.
 */
describe('DeleteDogDialog unknown blocking count', () => {
  it('disables the destructive button while the count is still being fetched, and says so', () => {
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'pending' }}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    expect(screen.getByText(/checking/i)).toBeInTheDocument();
  });

  it('never offers a plain Delete when the count failed — it offers a retry', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onRetryBlockingCount = vi.fn();
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={onDelete}
        dog={dog}
        blockingEntryCount={{ status: 'error', isRetrying: false }}
        onRetryBlockingCount={onRetryBlockingCount}
      />
    );

    expect(screen.getByRole('button', { name: /^delete$/i })).toBeDisabled();
    expect(screen.getByText(/could not check/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetryBlockingCount).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('disables Try again while the retry is in flight, so it cannot be double-fired', () => {
    // `isError` stays true through the refetch, so without this the button
    // stays live and un-spinning for the whole round trip — the user's only
    // reading is that their click did nothing.
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'error', isRetrying: true }}
        onRetryBlockingCount={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /checking|try again/i })).toBeDisabled();
  });

  it('offers no admin override while the count is unknown', () => {
    // The override exists to push past a KNOWN refusal. Showing it on an
    // unknown count would invite an admin to force-delete a dog that may have
    // nothing wrong with it at all.
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'error', isRetrying: false }}
        canForceDelete
        onForceDelete={() => {}}
      />
    );

    expect(screen.queryByRole('checkbox', { name: /I understand/i })).not.toBeInTheDocument();
  });
});

describe('toBlockingEntryCountState', () => {
  it('maps a failed query to error, not to zero', () => {
    expect(toBlockingEntryCountState({ isError: true, data: undefined })).toEqual({
      status: 'error',
      isRetrying: false,
    });
  });

  it('maps a failed query to error even when a stale count is still cached', () => {
    expect(toBlockingEntryCountState({ isError: true, data: 0 })).toEqual({
      status: 'error',
      isRetrying: false,
    });
    expect(toBlockingEntryCountState({ isError: true, data: 0, isFetching: true })).toEqual({
      status: 'error',
      isRetrying: true,
    });
  });

  it('maps an unresolved query to pending, not to zero', () => {
    expect(toBlockingEntryCountState({ isError: false, data: undefined })).toEqual({
      status: 'pending',
    });
  });

  it('maps a retained count with a refetch in flight to pending, not ready', () => {
    // React Query keeps `data` through `enabled: false`, so a re-opened dialog
    // holds the PREVIOUS open's number while the fresh read is in flight. That
    // number is not a fact about now.
    expect(
      toBlockingEntryCountState({ isError: false, data: 0, isFetching: true, isStale: true })
    ).toEqual({ status: 'pending' });
    expect(
      toBlockingEntryCountState({ isError: false, data: 3, isFetching: true, isStale: true })
    ).toEqual({ status: 'pending' });
  });

  it('still reports a settled count as ready', () => {
    expect(
      toBlockingEntryCountState({ isError: false, data: 2, isFetching: false, isStale: true })
    ).toEqual({ status: 'ready', count: 2 });
  });

  it('maps a resolved count through, including a real zero', () => {
    expect(toBlockingEntryCountState({ isError: false, data: 0 })).toEqual({
      status: 'ready',
      count: 0,
    });
    expect(toBlockingEntryCountState({ isError: false, data: 3 })).toEqual({
      status: 'ready',
      count: 3,
    });
  });
});

/**
 * The admin override. Rendered rather than unit-tested off the copy builders,
 * for the same reason as the block above: the property under test is which
 * handler the pressable button reaches, and no pure function can see that.
 */
describe('DeleteDogDialog admin override', () => {
  const blockedProps = {
    open: true as const,
    onClose: () => {},
    dog,
    blockingEntryCount: { status: 'ready' as const, count: 1 },
  };

  it('offers no override to a non-admin', () => {
    render(
      <DeleteDogDialog
        {...blockedProps}
        onDelete={() => {}}
        canForceDelete={false}
        onForceDelete={() => {}}
      />
    );

    expect(screen.queryByRole('checkbox', { name: /I understand/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  it('offers no override when the delete is not blocked', () => {
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={{ status: 'ready', count: 0 }}
        canForceDelete
        onForceDelete={() => {}}
      />
    );

    expect(screen.queryByRole('checkbox', { name: /I understand/i })).not.toBeInTheDocument();
  });

  it('keeps Delete disabled for an admin until the acknowledgement is ticked', async () => {
    const user = userEvent.setup();
    render(
      <DeleteDogDialog
        {...blockedProps}
        onDelete={() => {}}
        canForceDelete
        onForceDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /^delete$/i })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /I understand/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete anyway/i })).toBeEnabled()
    );
  });

  it('routes the acknowledged confirm to onForceDelete, not onDelete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onForceDelete = vi.fn();
    render(
      <DeleteDogDialog
        {...blockedProps}
        onDelete={onDelete}
        canForceDelete
        onForceDelete={onForceDelete}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: /I understand/i }));
    await user.click(await screen.findByRole('button', { name: /delete anyway/i }));

    await waitFor(() => expect(onForceDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('states that no refund is issued before the override can be taken', () => {
    render(
      <DeleteDogDialog
        {...blockedProps}
        onDelete={() => {}}
        canForceDelete
        onForceDelete={() => {}}
      />
    );

    expect(screen.getByText(/no refund is issued/i)).toBeInTheDocument();
  });
});
