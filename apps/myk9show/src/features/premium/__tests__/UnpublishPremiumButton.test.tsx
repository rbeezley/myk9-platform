/**
 * MYK9-2054: "Unpublish" asks first, and the confirmation says the entries are not affected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';

const unpublishMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock('../ownPremium', async importOriginal => ({
  ...(await importOriginal<typeof import('../ownPremium')>()),
  unpublishPremium: unpublishMock,
  useRefreshPremiumState: () => refreshMock,
}));

import { UnpublishPremiumButton, unpublishEntriesLine } from '../UnpublishPremiumButton';

describe('unpublishEntriesLine', () => {
  it.each([
    [0, 'No entries are affected.'],
    [null, 'No entries are affected.'],
    [1, '1 entry has been made. It is not affected.'],
    [3, '3 entries have been made. They are not affected.'],
  ])('%s entries', (count, expected) => {
    expect(unpublishEntriesLine(count)).toBe(expected);
  });
});

describe('UnpublishPremiumButton', () => {
  beforeEach(() => {
    unpublishMock.mockReset().mockResolvedValue(undefined);
    refreshMock.mockReset().mockResolvedValue(undefined);
  });

  it('does nothing until confirmed, and the confirmation says entries are not affected', async () => {
    const user = userEvent.setup();
    render(<UnpublishPremiumButton showId="show-1" entryCount={3} />);

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(unpublishMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/3 entries have been made\. They are not affected\./)
    ).toBeTruthy();
    expect(
      screen.getByText(/removes the premium list download and the public announcement/)
    ).toBeTruthy();
  });

  it('unpublishes this show and refreshes the premium state on confirm', async () => {
    const user = userEvent.setup();
    render(<UnpublishPremiumButton showId="show-1" entryCount={0} />);

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Unpublish')!
    );

    await waitFor(() => expect(unpublishMock).toHaveBeenCalledWith('show-1'));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('cancelling leaves the premium published', async () => {
    const user = userEvent.setup();
    render(<UnpublishPremiumButton showId="show-1" entryCount={2} />);

    await user.click(screen.getByRole('button', { name: 'Unpublish' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(unpublishMock).not.toHaveBeenCalled();
  });
});
