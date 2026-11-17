/**
 * MYK9-2081: the show edit form sends only the fields the user changed. A form opened before
 * another device flipped a setting must not write the old value of that setting back.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { changedShowSaveData, hasShowChanges, showToFormData } from '../ShowEditPanel.helpers';
import type { Show } from '@/types/show-types';

vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: () => ({ data: [] }),
}));

const SHOW: Partial<Show> = {
  id: 'show-1',
  name: 'Fall Trial',
  status: 'published',
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
  confirmationMessage: 'Bring a crate',
};

const setup = (show: Partial<Show> = SHOW) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const props = { open: true, onClose: vi.fn(), showId: 'show-1', showName: 'Fall Trial', onSave };
  const view = render(<ShowEditPanel {...props} initialShowData={show} />);
  return { onSave, props, ...view };
};

describe('show edit form saves only what changed (MYK9-2081)', () => {
  it('a rename after another device flipped a switch sends the name and nothing else', async () => {
    const { onSave, props, user, rerender } = setup();

    const name = screen.getByLabelText(/show name/i);
    await user.clear(name);
    await user.type(name, 'Renamed');
    // Another device turned "Nationals" on; this panel's props follow.
    rerender(<ShowEditPanel {...props} initialShowData={{ ...SHOW, isNationals: true }} />);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ name: 'Renamed', assignedJudges: [] });
  });

  it('an untouched form has nothing to save', async () => {
    const { onSave } = setup();

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();

    const opened = showToFormData(SHOW);
    expect(hasShowChanges(opened, showToFormData(SHOW))).toBe(false);
    expect(changedShowSaveData(opened, showToFormData(SHOW))).toEqual({ assignedJudges: [] });
  });

  it('a cleared note sends the note alone', async () => {
    const { onSave, user } = setup();

    await user.clear(screen.getByLabelText(/note to exhibitors/i));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ confirmationMessage: '', assignedJudges: [] });
  });
});
