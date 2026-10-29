import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { CoinFlipDialog, OFFLINE_COIN_FLIP_MESSAGE } from './CoinFlipDialog';
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
  entries: [entry('rex', '12', 'Rex'), entry('bella', '31', 'Bella')],
};
const trio: ClassTieGroup = {
  rank: 3,
  byPoints: false,
  entries: [entry('a', '40', 'Ace'), entry('b', '41', 'Bo'), entry('c', '42', 'Cy')],
};

const onSave = vi.fn();
const renderDialog = (props: { groups?: ClassTieGroup[]; online?: boolean } = {}) =>
  render(
    <CoinFlipDialog
      open
      onOpenChange={() => undefined}
      className="Container Novice A"
      groups={props.groups ?? [pair]}
      online={props.online ?? true}
      saving={false}
      onSave={onSave}
    />
  );

beforeEach(() => {
  onSave.mockReset();
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
});
