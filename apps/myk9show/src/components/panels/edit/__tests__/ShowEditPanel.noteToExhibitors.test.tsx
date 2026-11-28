/**
 * MYK9-2114: typing a note to exhibitors and pressing Save hands the note to onSave.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import type { Show } from '@/types/show-types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

const SHOW: Partial<Show> = {
  id: 'show-1',
  name: 'Fall Trial',
  status: 'draft',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-11-07',
  endDate: '2026-11-08',
  location: 'Expo Hall',
  entryOpenDate: '2026-10-01',
  entryCloseDate: '2026-10-24',
  preEntryFee: '30',
  dayOfShowFee: '35',
  isNationals: false,
};

const setup = (show: Partial<Show>) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ShowEditPanel
      open
      onClose={vi.fn()}
      showId="show-1"
      showName="Fall Trial"
      initialShowData={show}
      onSave={onSave}
    />
  );
  return { onSave, ...view };
};

describe('Note to exhibitors save (MYK9-2114)', () => {
  it('sends the typed note', async () => {
    const { onSave, user } = setup(SHOW);
    await user.type(screen.getByLabelText(/note to exhibitors/i), 'Park in the north lot.');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      confirmationMessage: 'Park in the north lot.',
    });
  });

  it('sends an empty string when the note is cleared', async () => {
    const { onSave, user } = setup({ ...SHOW, confirmationMessage: 'Bring a crate' });
    await user.clear(screen.getByLabelText(/note to exhibitors/i));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ confirmationMessage: '' });
  });
});
