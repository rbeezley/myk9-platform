import { describe, expect, it, vi } from 'vitest';
import { applyReturnedClubId } from '../ShowCreationWizard/applyReturnedClubId';

describe('applyReturnedClubId', () => {
  it('selects the returned club even when the draft previously selected another club', () => {
    const updateShowData = vi.fn();

    applyReturnedClubId('new-club', undefined, updateShowData);

    expect(updateShowData).toHaveBeenCalledWith({ clubId: 'new-club' });
  });

  it('does not replace the club while editing an existing show', () => {
    const updateShowData = vi.fn();

    applyReturnedClubId(
      'new-club',
      { showId: 'existing-show', mode: 'add-trials' },
      updateShowData
    );

    expect(updateShowData).not.toHaveBeenCalled();
  });
});
