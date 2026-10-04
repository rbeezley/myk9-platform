/**
 * MYK9-979 (Codex round 3 on #2707): "Accept online entries" is not part of
 * the show edit form. The switch saves itself (useOnlineEntriesSwitch), so a
 * form save never carries online_entries_enabled, not even when another
 * device changed it while this panel held an unrelated dirty edit.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditPanel } from '../ShowEditPanel';
import { formDataToShowSaveData, showToFormData } from '../ShowEditPanel.helpers';
import type { Show } from '@/types/show-types';
import type { ShowEditFormData } from '../ShowEditPanel.types';

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
};

describe('show edit form — online entries are never form data', () => {
  it.each([true, false, undefined])('showToFormData drops the switch (%s)', value => {
    expect(showToFormData({ ...SHOW, onlineEntriesEnabled: value })).not.toHaveProperty(
      'onlineEntriesEnabled'
    );
  });

  it('a save never carries it, even if a value were smuggled into the form', () => {
    const form = {
      ...showToFormData(SHOW),
      onlineEntriesEnabled: false,
    } as unknown as ShowEditFormData;
    expect(formDataToShowSaveData(form)).not.toHaveProperty('onlineEntriesEnabled');
  });

  it('the exact Codex scenario: the value changes underneath a dirty form, and Save does not reverse it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const props = {
      open: true,
      onClose: vi.fn(),
      showId: 'show-1',
      showName: 'Fall Trial',
      onSave,
    };
    const { user, rerender } = render(
      <ShowEditPanel {...props} initialShowData={{ ...SHOW, onlineEntriesEnabled: false }} />
    );

    // An unrelated dirty edit.
    const name = screen.getByLabelText(/show name/i);
    await user.clear(name);
    await user.type(name, 'Renamed');

    // Another device turns online entries on; the panel's props follow.
    rerender(
      <ShowEditPanel {...props} initialShowData={{ ...SHOW, onlineEntriesEnabled: true }} />
    );

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved).toHaveProperty('name', 'Renamed');
    expect(saved).not.toHaveProperty('onlineEntriesEnabled');
  });
});
