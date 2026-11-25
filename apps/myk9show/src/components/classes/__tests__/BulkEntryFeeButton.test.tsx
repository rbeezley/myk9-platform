import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { BulkEntryFeeButton } from '../BulkEntryFeeButton';

const setFee = vi.hoisted(() => vi.fn());
vi.mock('../useBulkClassEntryFee', () => ({
  useBulkClassEntryFee: () => ({ setFee, busy: false }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', preEntryFee: '25' }] }),
}));

const classes = [
  { id: 'c1', name: 'Detective' },
  { id: 'c2', name: 'Master Interior' },
];

function setup() {
  const onFullSuccess = vi.fn();
  const utils = render(
    <BulkEntryFeeButton
      showId="show-1"
      classes={classes}
      disabled={false}
      onFullSuccess={onFullSuccess}
    />
  );
  return { ...utils, onFullSuccess };
}

describe('Select classes: Set entry fee (MYK9-1931)', () => {
  beforeEach(() => {
    setFee.mockReset();
    setFee.mockResolvedValue(true);
  });

  it('sets the typed fee on every selected class, then clears the selection', async () => {
    const { user, onFullSuccess } = setup();

    await user.click(screen.getByRole('button', { name: 'Set entry fee' }));
    expect(screen.getByText("The show's fee is $25.")).toBeInTheDocument();
    await user.type(screen.getByLabelText('Entry fee for these classes'), '40');
    await user.click(screen.getByRole('button', { name: 'Set fee' }));

    expect(setFee).toHaveBeenCalledWith(classes, 40);
    expect(onFullSuccess).toHaveBeenCalled();
  });

  it("returns every selected class to the show's fee with an empty fee", async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Set entry fee' }));
    await user.click(screen.getByRole('button', { name: "Use the show's fee" }));

    expect(setFee).toHaveBeenCalledWith(classes, null);
  });

  it('offers no Set fee until a fee above zero is typed', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Set entry fee' }));

    expect(screen.getByRole('button', { name: 'Set fee' })).toBeDisabled();
  });

  it('keeps the selection when a write fails', async () => {
    setFee.mockResolvedValue(false);
    const { user, onFullSuccess } = setup();

    await user.click(screen.getByRole('button', { name: 'Set entry fee' }));
    await user.click(screen.getByRole('button', { name: "Use the show's fee" }));

    expect(onFullSuccess).not.toHaveBeenCalled();
  });
});
