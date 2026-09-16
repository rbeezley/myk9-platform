/**
 * The admin override's behaviour, exercised through the page-level owner.
 *
 * These moved here from DogsBulkActionsBar.test.tsx when the page took
 * ownership of the dialog (MYK9-584) — the bar no longer renders it, so testing
 * them there would have been testing a component that cannot show it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const forceDeleteMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useForceDeleteDogMutation: () => ({
    mutateAsync: (...args: unknown[]) => forceDeleteMutateAsync(...args),
  }),
}));

import { useBlockedDogDeletes } from '../useBlockedDogDeletes';
import { BlockedDogDeleteDialog } from '../BlockedDogDeleteDialog';
import type { Dog } from '@/types/dog-types';

function dog(id: string): Dog {
  return {
    id,
    name: `Dog ${id}`,
    callName: `Dog ${id}`,
    breed: 'Border Collie',
    sex: 'male',
    ownerId: 'owner-1',
    status: 'active',
  } as Dog;
}

function renderDialog(canForceDelete: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Harness() {
    const blocked = useBlockedDogDeletes();
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        { type: 'button', onClick: () => blocked.reportBlocked([dog('a'), dog('b')]) },
        'report'
      ),
      blocked.blockedDogs.length > 0
        ? React.createElement(BlockedDogDeleteDialog, {
            dogs: blocked.blockedDogs,
            open: true,
            onClose: blocked.dismiss,
            onForceDelete: blocked.forceDelete,
            canForceDelete,
          })
        : null
    );
  }

  render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness)));
  return screen.getByRole('button', { name: 'report' });
}

describe('BlockedDogDeleteDialog override', () => {
  beforeEach(() => {
    forceDeleteMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it('shows a non-admin no override and no dead Delete anyway button (MYK9-600)', async () => {
    const report = renderDialog(false);
    await act(async () => {
      report.click();
    });

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByRole('checkbox', { name: /I understand/i })
    ).not.toBeInTheDocument();
    // A permanently disabled destructive button with no explanation is a dead
    // control. INTENT (docs/INTENT.md) asks for calm surfaces: for a viewer who
    // can never take the action, the dialog is a report, so it offers only Close.
    expect(
      within(dialog).queryByRole('button', { name: /delete anyway/i })
    ).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeEnabled();
  });

  it('keeps Delete anyway disabled for an admin until the acknowledgement is ticked', async () => {
    const user = userEvent.setup();
    const report = renderDialog(true);
    await act(async () => {
      report.click();
    });

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /delete anyway/i });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it('routes the acknowledged confirm to force_delete_dog for every blocked dog', async () => {
    const user = userEvent.setup();
    const report = renderDialog(true);
    await act(async () => {
      report.click();
    });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await user.click(within(dialog).getByRole('button', { name: /delete anyway/i }));

    await waitFor(() => {
      expect(forceDeleteMutateAsync).toHaveBeenCalledWith({ id: 'a' });
      expect(forceDeleteMutateAsync).toHaveBeenCalledWith({ id: 'b' });
    });
    expect(forceDeleteMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('re-arms the acknowledgement on a second report', async () => {
    const user = userEvent.setup();
    const report = renderDialog(true);
    await act(async () => {
      report.click();
    });

    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await waitFor(() =>
      expect(within(dialog).getByRole('checkbox', { name: /I understand/i })).toBeChecked()
    );

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await act(async () => {
      report.click();
    });
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox', { name: /I understand/i })).not.toBeChecked();
  });
});
