import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  CoinFlipDialog,
  OFFLINE_COIN_FLIP_MESSAGE,
  type CoinFlipGroupsState,
} from './CoinFlipDialog';
import type { ClassTieGroup } from './coinFlipRows';

const entry = (entryId: string, armband: string, dogName: string) => ({
  entryId,
  armband: String(armband),
  dogName,
  totalFaults: 0,
  pointsEarned: null,
  timeSeconds: 41.2,
});

const pair: ClassTieGroup = {
  rank: 2,
  byPoints: false,
  recorded: false,
  entries: [entry('rex', '12', 'Rex'), entry('bella', '31', 'Bella')],
};
const trio: ClassTieGroup = {
  rank: 3,
  byPoints: false,
  recorded: false,
  entries: [entry('a', '40', 'Ace'), entry('b', '41', 'Bo'), entry('c', '42', 'Cy')],
};

const onSave = vi.fn();
const onRetry = vi.fn();
const renderDialog = (
  props: { groups?: ClassTieGroup[]; online?: boolean; groupsState?: CoinFlipGroupsState } = {}
) =>
  render(
    <CoinFlipDialog
      open
      onOpenChange={() => undefined}
      className="Container Novice A"
      groups={props.groups ?? [pair]}
      groupsState={props.groupsState ?? 'ready'}
      onRetry={onRetry}
      online={props.online ?? true}
      saving={false}
      onSave={onSave}
    />
  );

beforeEach(() => {
  onSave.mockReset();
  onRetry.mockReset();
});

describe('CoinFlipDialog', () => {
  it('names each tie, its dogs and their shared result in plain words', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Tied for 2nd')).toBeInTheDocument();
    expect(within(dialog).getByText(/0 faults/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Armband 12 Rex/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Armband 31 Bella/ })).toBeInTheDocument();
    expect(dialog.textContent ?? '').not.toMatch(/tiebreak|—/i);
  });

  it('one tap saves a pair: the dog that won first, the other follows', async () => {
    const { user } = renderDialog();
    const save = await screen.findByRole('button', { name: 'Save coin flip' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Armband 31 Bella/ }));
    expect(save).toBeEnabled();
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith([['bella', 'rex']]);
  });

  it('three dogs are tapped in finishing order, and the last one follows on its own', async () => {
    const { user } = renderDialog({ groups: [trio] });
    const save = await screen.findByRole('button', { name: 'Save coin flip' });

    await user.click(screen.getByRole('button', { name: /Armband 42 Cy/ }));
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Armband 40 Ace/ }));
    expect(save).toBeEnabled();
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith([['c', 'a', 'b']]);
  });

  it('waits for every tie before it can be saved', async () => {
    const { user } = renderDialog({ groups: [pair, trio] });
    const save = await screen.findByRole('button', { name: 'Save coin flip' });

    await user.click(screen.getByRole('button', { name: /Armband 12 Rex/ }));
    expect(save).toBeDisabled();
  });

  it('offline: the buttons stay, saving is off and the reason is shown', async () => {
    const { user } = renderDialog({ online: false });
    const save = await screen.findByRole('button', { name: 'Save coin flip' });

    await user.click(screen.getByRole('button', { name: /Armband 12 Rex/ }));
    expect(save).toBeDisabled();
    expect(screen.getByText(OFFLINE_COIN_FLIP_MESSAGE)).toBeInTheDocument();
    expect(OFFLINE_COIN_FLIP_MESSAGE).toBe('Connect to record the coin flip');
  });

  it('a recorded flip opens pre-filled and re-sends the order it was changed to', async () => {
    const recorded: ClassTieGroup = {
      ...pair,
      recorded: true,
      entries: [pair.entries[1]!, pair.entries[0]!],
    };
    const { user } = renderDialog({ groups: [recorded] });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Change the coin flip')).toBeInTheDocument();
    const save = within(dialog).getByRole('button', { name: 'Save coin flip' });
    expect(save).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /Armband 31 Bella/ })).toHaveTextContent(
      '2nd'
    );

    await user.click(within(dialog).getByRole('button', { name: /Armband 12 Rex/ }));
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith([['rex', 'bella']]);
  });

  it('shows loading, not an empty dialog, while the show details are unread', async () => {
    renderDialog({ groups: [], groupsState: 'loading' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Loading the show details…')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save coin flip' })).toBeDisabled();
  });

  // Codex round 6: a successful save closes the dialog from the parent, not through its own
  // close handler, so a reopen must not resurface the picks from before the save.
  it('a dialog closed by its parent reopens without the earlier picks', async () => {
    const props = {
      onOpenChange: () => undefined,
      className: 'Container Novice A',
      groups: [pair],
      groupsState: 'ready' as const,
      onRetry,
      online: true,
      saving: false,
      onSave,
    };
    const { user, rerender } = render(<CoinFlipDialog open {...props} />);
    await user.click(await screen.findByRole('button', { name: /Armband 31 Bella/ }));
    expect(screen.getByRole('button', { name: 'Save coin flip' })).toBeEnabled();

    rerender(<CoinFlipDialog open={false} {...props} />);
    rerender(<CoinFlipDialog open {...props} />);

    expect(await screen.findByRole('button', { name: 'Save coin flip' })).toBeDisabled();
  });

  it('offers a retry when the show details could not be read', async () => {
    const { user } = renderDialog({ groups: [], groupsState: 'unavailable' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save coin flip' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
